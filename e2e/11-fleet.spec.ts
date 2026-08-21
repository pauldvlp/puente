import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Fleet operations. Upgrading a connector for real needs SSH and a Cloudflare tunnel, neither of
// which exists in CI, so the sequencing and failure handling are covered by unit tests against a
// doubled NodesService. What is asserted here is the part that can be: the licence gate, the
// refusal to pretend when there is nothing to act on, and that the bar is absent without a licence.

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

const licenceCard = (main: Locator) =>
  main
    .locator('[data-slot="card"]')
    .filter({ hasText: /License/ })
    .first();

async function activateAgency(page: Page): Promise<void> {
  await page.locator('a[href="/settings"]').first().click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const badge = main.locator('[data-slot="badge"]').filter({ hasText: 'puente Agency' });
  if (await badge.count()) return;
  const remove = licenceCard(main).getByRole('button', { name: 'Remove' });
  if (await remove.count()) await remove.first().click();
  await expect(main.locator('#license-key')).toBeVisible();
  const key = execFileSync(
    process.execPath,
    [
      ISSUER,
      '--licensee',
      'Fleet E2E',
      '--email',
      'e2e@example.com',
      '--plan',
      'agency',
      '--key',
      SIGNING_KEY,
    ],
    { encoding: 'utf8' },
  ).trim();
  await main.locator('#license-key').fill(key);
  await main.getByRole('button', { name: 'Activate' }).click();
  await expect(badge).toBeVisible();
}

test('Community gets no fleet bar and no fleet endpoint', async ({ page }) => {
  await signIn(page);
  await page.locator('a[href="/nodes"]').first().click();

  await expect(page.getByRole('button', { name: /Update every connector/ })).toHaveCount(0);

  const res = await api(page, '/fleet/run', {
    method: 'POST',
    body: { operation: 'upgrade' },
  });
  expect(res.status).toBe(403);
  expect(res.json).toMatchObject({ code: 'PRO_REQUIRED', feature: 'fleet' });
});

test.describe('with a fleet licence', () => {
  test.skip(!CAN_ISSUE, `no signing key at ${SIGNING_KEY} — maintainer-only path`);

  test('says there is nothing to act on rather than reporting a hollow success', async ({
    page,
  }) => {
    await signIn(page);
    await activateAgency(page);

    // A node with no connector is not something to upgrade, and pretending otherwise would
    // report success for work that never happened.
    const created = await api(page, '/nodes', {
      method: 'POST',
      body: { kind: 'local', name: 'never-provisioned' },
    });
    expect(created.status).toBe(201);

    const res = await api(page, '/fleet/run', {
      method: 'POST',
      body: { operation: 'upgrade' },
    });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ code: 'FLEET_EMPTY' });

    await api(page, `/nodes/${(created.json as { id: string }).id}`, { method: 'DELETE' });

    // Back to Community for whatever runs next.
    await page.locator('a[href="/settings"]').first().click();
    await licenceCard(page.getByRole('main'))
      .getByRole('button', { name: 'Remove' })
      .first()
      .click();
  });
});
