import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Team accounts and what each role may actually do. The assertions that matter are the negative
// ones: a viewer must not be able to change anything, and an operator must not be able to
// reconfigure the install — those are the promises that make roles worth paying for.

const USER = 'admin';
const PASS = 'e2e-password-123';
const MATE_PASS = 'teammate-password-1';

const SIGNING_KEY =
  process.env.PUENTE_LICENSE_SIGNING_KEY ?? join(homedir(), '.puente-licensing', 'signing-key.pem');
const CAN_ISSUE = existsSync(SIGNING_KEY);
const ISSUER = resolve(process.cwd(), 'scripts/license/issue.mjs');

async function signIn(page: Page, username = USER, password = PASS): Promise<void> {
  await page.goto('/login');
  await page.fill('#username', username);
  await page.fill('#password', password);
  if (await page.locator('#confirm').count()) await page.fill('#confirm', password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
}

async function openSettings(page: Page): Promise<Locator> {
  await signIn(page);
  await page.locator('a[href="/settings"]').first().click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Settings' })).toBeVisible();
  return main;
}

const teamCard = (main: Locator) =>
  main.locator('[data-slot="card"]').filter({ hasText: 'Team' }).first();

const licenceCard = (main: Locator) =>
  main
    .locator('[data-slot="card"]')
    .filter({ hasText: /License/ })
    .first();

async function activateAgency(main: Locator): Promise<void> {
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
      'Team E2E',
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

/** Remove every account except the one signed in, so each test starts from one owner. */
async function resetTeam(page: Page): Promise<void> {
  const list = await api(page, '/team');
  for (const m of (list.json as { id: string; isYou: boolean }[]).filter((x) => !x.isYou)) {
    await api(page, `/team/${m.id}`, { method: 'DELETE' });
  }
}

test('Community has one account and is told what a team would add', async ({ page }) => {
  const main = await openSettings(page);
  const card = teamCard(main);

  await expect(card.locator('[data-slot="badge"]').filter({ hasText: 'Pro' })).toBeVisible();
  await expect(card.getByText(USER)).toBeVisible();
  await expect(card.getByText(/More than one account/)).toBeVisible();
  await expect(card.locator('#team-username')).toHaveCount(0);
});

test('the server refuses a second account without a licence', async ({ page }) => {
  await openSettings(page);
  const res = await api(page, '/team', {
    method: 'POST',
    body: { username: 'sneaky', password: 'a-good-password', role: 'owner' },
  });
  expect(res.status).toBe(403);
  expect(res.json).toMatchObject({ code: 'PRO_REQUIRED', feature: 'team' });
});

test.describe('with a team licence', () => {
  test.skip(!CAN_ISSUE, `no signing key at ${SIGNING_KEY} — maintainer-only path`);

  test('a viewer can look at everything and change nothing', async ({ page, browser }) => {
    const main = await openSettings(page);
    await activateAgency(main);
    await resetTeam(page);

    const card = teamCard(main);
    await card.locator('#team-username').fill('vera');
    await card.locator('#team-password').fill(MATE_PASS);
    await card.locator('[data-slot="select-trigger"]').last().click();
    await page.getByRole('option', { name: 'Viewer' }).click();
    await card.getByRole('button', { name: 'Add account' }).click();
    await expect(card.getByText('vera')).toBeVisible();

    // Sign in as her, in a clean context so the owner's session is untouched.
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await signIn(viewerPage, 'vera', MATE_PASS);

    // Reading is fine.
    const nodes = await api(viewerPage, '/nodes');
    expect(nodes.status).toBe(200);

    // Writing is not — and nobody had to annotate /nodes for that to hold.
    const created = await api(viewerPage, '/nodes', {
      method: 'POST',
      body: { kind: 'local', name: 'vera-should-not-manage-this' },
    });
    expect(created.status).toBe(403);
    expect(created.json).toMatchObject({ code: 'ROLE_REQUIRED', required: 'operator' });

    await viewerContext.close();
    await resetTeam(page);
  });

  test('an operator works day to day but cannot reconfigure the install', async ({
    page,
    browser,
  }) => {
    const main = await openSettings(page);
    await activateAgency(main);
    await resetTeam(page);

    const created = await api(page, '/team', {
      method: 'POST',
      body: { username: 'otto', password: MATE_PASS, role: 'operator' },
    });
    expect(created.status).toBe(201);

    const ctx = await browser.newContext();
    const operatorPage = await ctx.newPage();
    await signIn(operatorPage, 'otto', MATE_PASS);

    // Day-to-day work: allowed.
    const node = await api(operatorPage, '/nodes', {
      method: 'POST',
      body: { kind: 'local', name: 'otto-node' },
    });
    expect(node.status).toBe(201);

    // Owner-only territory: refused.
    const disconnect = await api(operatorPage, '/cloudflare/disconnect', { method: 'POST' });
    expect(disconnect.status).toBe(403);
    expect(disconnect.json).toMatchObject({ code: 'ROLE_REQUIRED', required: 'owner' });

    // Deleting a node tears down a tunnel — also owner-only.
    const nodeId = (node.json as { id: string }).id;
    const del = await api(operatorPage, `/nodes/${nodeId}`, { method: 'DELETE' });
    expect(del.status).toBe(403);

    // And they cannot hand themselves the keys.
    const promote = await api(operatorPage, '/team', {
      method: 'POST',
      body: { username: 'otto2', password: MATE_PASS, role: 'owner' },
    });
    expect(promote.status).toBe(403);

    await ctx.close();
    await api(page, `/nodes/${nodeId}`, { method: 'DELETE' });
    await resetTeam(page);
  });

  test('the licence seat count is what stops the fifth account, not the UI', async ({ page }) => {
    const main = await openSettings(page);
    await activateAgency(main);
    await resetTeam(page);

    // The agency plan sells 15 seats; fill them from the API, owner included.
    for (let i = 0; i < 14; i += 1) {
      const res = await api(page, '/team', {
        method: 'POST',
        body: { username: `seat${i}`, password: MATE_PASS, role: 'viewer' },
      });
      expect(res.status).toBe(201);
    }

    const overflow = await api(page, '/team', {
      method: 'POST',
      body: { username: 'one-too-many', password: MATE_PASS, role: 'viewer' },
    });
    expect(overflow.status).toBe(400);
    expect(overflow.json).toMatchObject({ code: 'SEATS_EXHAUSTED', seats: 15 });

    await resetTeam(page);
  });

  test('the last owner cannot be demoted or deleted', async ({ page }) => {
    const main = await openSettings(page);
    await activateAgency(main);
    await resetTeam(page);

    const me = ((await api(page, '/team')).json as { id: string; isYou: boolean }[]).find(
      (m) => m.isYou,
    )!;

    const demote = await api(page, `/team/${me.id}`, {
      method: 'PATCH',
      body: { role: 'viewer' },
    });
    expect(demote.status).toBe(400);
    expect(demote.json).toMatchObject({ code: 'LAST_OWNER' });

    const remove = await api(page, `/team/${me.id}`, { method: 'DELETE' });
    expect(remove.status).toBe(400);
    expect(remove.json).toMatchObject({ code: 'CANNOT_DELETE_SELF' });

    // Leave the install as Community for whatever runs next.
    await licenceCard(main).getByRole('button', { name: 'Remove' }).first().click();
  });
});
