import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// The audit trail: who did what, searchable by everyone, exportable on Pro. The export is the
// paid half, so the test downloads the actual file and reads it rather than trusting a 200.

const USER = 'admin';
const PASS = 'e2e-password-123';

const SIGNING_KEY =
  process.env.PUENTE_LICENSE_SIGNING_KEY ?? join(homedir(), '.puente-licensing', 'signing-key.pem');
const CAN_ISSUE = existsSync(SIGNING_KEY);
const ISSUER = resolve(process.cwd(), 'scripts/license/issue.mjs');

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  if (await page.locator('#confirm').count()) await page.fill('#confirm', PASS);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
}

async function api(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; json: unknown }> {
  return page.evaluate(
    async ({ path, init }) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${localStorage.getItem('puente_token') ?? ''}`,
      };
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(`/api${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const text = await res.text();
      return { status: res.status, json: text ? (JSON.parse(text) as unknown) : null };
    },
    { path, init },
  );
}

async function activatePro(page: Page): Promise<void> {
  await page.locator('a[href="/settings"]').first().click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const badge = main.locator('[data-slot="badge"]').filter({ hasText: /puente (Pro|Agency)/ });
  if (await badge.count()) return;
  const key = execFileSync(
    process.execPath,
    [
      ISSUER,
      '--licensee',
      'Audit E2E',
      '--email',
      'e2e@example.com',
      '--plan',
      'pro',
      '--key',
      SIGNING_KEY,
    ],
    { encoding: 'utf8' },
  ).trim();
  await main.locator('#license-key').fill(key);
  await main.getByRole('button', { name: 'Activate' }).click();
  await expect(badge).toBeVisible();
}

const licenceCard = (main: Locator) =>
  main
    .locator('[data-slot="card"]')
    .filter({ hasText: /License/ })
    .first();

/** One local node per workspace, so clear whatever a previous spec left behind. */
async function resetNodes(page: Page): Promise<void> {
  const list = await api(page, '/nodes');
  for (const n of list.json as { id: string }[]) {
    await api(page, `/nodes/${n.id}`, { method: 'DELETE' });
  }
}

test('the feed records who did it, and anyone can search it', async ({ page }) => {
  await signIn(page);
  await resetNodes(page);

  // Something to find: creating a node writes an activity entry.
  const node = await api(page, '/nodes', {
    method: 'POST',
    body: { kind: 'local', name: 'audit-subject' },
  });
  expect(node.status).toBe(201);

  await page.locator('a[href="/activity"]').first().click();
  // Two headings say "Activity" — the top bar's and the page's.
  await expect(page.getByRole('main').getByRole('heading', { name: 'Activity' })).toBeVisible();

  // The actor is on the row — the whole point of an audit trail.
  await expect(page.getByText(`by ${USER}`).first()).toBeVisible();

  // Searching is free.
  await page.getByLabel('Search activity').fill('audit-subject');
  await expect(page.getByText(/audit-subject/).first()).toBeVisible();

  await page.getByLabel('Search activity').fill('nothing-will-match-this-string');
  await expect(page.getByText('Nothing matches')).toBeVisible();

  await api(page, `/nodes/${(node.json as { id: string }).id}`, { method: 'DELETE' });
});

test('Community is told the export is Pro, and the endpoint agrees', async ({ page }) => {
  await signIn(page);
  await page.locator('a[href="/activity"]').first().click();
  await expect(page.getByText('Export is a Pro feature')).toBeVisible();

  const res = await api(page, '/audit/export?format=csv');
  expect(res.status).toBe(403);
  expect(res.json).toMatchObject({ code: 'PRO_REQUIRED', feature: 'audit' });
});

test.describe('with an audit licence', () => {
  test.skip(!CAN_ISSUE, `no signing key at ${SIGNING_KEY} — maintainer-only path`);

  test('exports a CSV a spreadsheet can open', async ({ page }) => {
    await signIn(page);
    await activatePro(page);
    await resetNodes(page);

    // An entry whose message contains a comma, which is what breaks naive CSV writers.
    const node = await api(page, '/nodes', {
      method: 'POST',
      body: { kind: 'local', name: 'comma, in the name' },
    });
    expect(node.status).toBe(201);

    await page.locator('a[href="/activity"]').first().click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^puente-audit-\d{4}-\d{2}-\d{2}\.csv$/);
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const csv = Buffer.concat(chunks).toString('utf8');

    expect(csv.split('\n')[0]).toBe('ts,level,action,username,message,nodeId,routeId');
    expect(csv).toContain(USER); // the actor made it into the file
    expect(csv).toContain('"'); // the comma in the node name forced quoting

    await api(page, `/nodes/${(node.json as { id: string }).id}`, { method: 'DELETE' });

    // Back to Community for whatever runs next.
    await page.locator('a[href="/settings"]').first().click();
    await licenceCard(page.getByRole('main'))
      .getByRole('button', { name: 'Remove' })
      .first()
      .click();
  });
});
