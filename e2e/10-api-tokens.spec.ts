import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// API tokens. The point of the feature is that a script can drive puente without a password and
// with a role of its own, so the tests use a token the way a script would — a bare fetch with a
// bearer header, no session anywhere — and check the role holds.

const USER = 'admin';
const PASS = 'e2e-password-123';

const SIGNING_KEY =
  process.env.PUENTE_LICENSE_SIGNING_KEY ?? join(homedir(), '.puente-licensing', 'signing-key.pem');
const CAN_ISSUE = existsSync(SIGNING_KEY);
const ISSUER = resolve(process.cwd(), 'scripts/license/issue.mjs');

async function openSettings(page: Page): Promise<Locator> {
  await page.goto('/login');
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  if (await page.locator('#confirm').count()) await page.fill('#confirm', PASS);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await page.locator('a[href="/settings"]').first().click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Settings' })).toBeVisible();
  return main;
}

/**
 * Filtered on text only this card has: "API tokens" also appears inside the licence card's
 * feature list, and `.first()` picks that one.
 */
const tokensCard = (main: Locator, state: 'locked' | 'unlocked') =>
  main
    .locator('[data-slot="card"]')
    .filter({ hasText: state === 'locked' ? 'Tokens let a script' : 'What will use it' });

const licenceCard = (main: Locator) =>
  main
    .locator('[data-slot="card"]')
    .filter({ hasText: /License/ })
    .first();

async function activatePro(main: Locator): Promise<void> {
  const badge = main.locator('[data-slot="badge"]').filter({ hasText: /puente (Pro|Agency)/ });
  if (await badge.count()) return;
  const remove = licenceCard(main).getByRole('button', { name: 'Remove' });
  if (await remove.count()) await remove.first().click();
  await expect(main.locator('#license-key')).toBeVisible();
  const key = execFileSync(
    process.execPath,
    [
      ISSUER,
      '--licensee',
      'Token E2E',
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

/** A request made the way a CI job would: no cookies, no session, just the token. */
async function asToken(
  page: Page,
  token: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; json: unknown }> {
  return page.evaluate(
    async ({ token, path, init }) => {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(`/api${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const text = await res.text();
      return { status: res.status, json: text ? (JSON.parse(text) as unknown) : null };
    },
    { token, path, init },
  );
}

async function session(
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

test('Community can see which tokens exist but not mint one', async ({ page }) => {
  const main = await openSettings(page);
  const card = tokensCard(main, 'locked');

  await expect(card.locator('[data-slot="badge"]').filter({ hasText: 'Pro' })).toBeVisible();
  await expect(card.locator('#token-name')).toHaveCount(0);

  const res = await session(page, '/api-tokens', {
    method: 'POST',
    body: { name: 'sneaky', role: 'owner' },
  });
  expect(res.status).toBe(403);
  expect(res.json).toMatchObject({ code: 'PRO_REQUIRED', feature: 'api' });
});

test.describe('with an api licence', () => {
  test.skip(!CAN_ISSUE, `no signing key at ${SIGNING_KEY} — maintainer-only path`);

  test('a token drives the API with the role it was given, and only that', async ({ page }) => {
    const main = await openSettings(page);
    await activatePro(main);
    const card = tokensCard(main, 'unlocked');

    // Mint a viewer token through the panel, the way a person would.
    await card.locator('#token-name').fill('read-only pipeline');
    await card.locator('[data-slot="select-trigger"]').first().click();
    await page.getByRole('option', { name: 'Viewer' }).click();
    await card.getByRole('button', { name: 'Create token' }).click();

    // Shown exactly once, and the card says so.
    await expect(card.getByText('Copy it now — this is the only time it is shown.')).toBeVisible();
    const secret = (await card.locator('code').first().textContent())?.trim() ?? '';
    expect(secret.startsWith('pnt_')).toBe(true);

    // It authenticates with no session involved…
    const read = await asToken(page, secret, '/nodes');
    expect(read.status).toBe(200);

    // …and the role travels with it.
    const write = await asToken(page, secret, '/nodes', {
      method: 'POST',
      body: { kind: 'local', name: 'a-viewer-should-not-manage-this' },
    });
    expect(write.status).toBe(403);
    expect(write.json).toMatchObject({ code: 'ROLE_REQUIRED', required: 'operator' });

    // Revoking kills it immediately.
    const list = (await session(page, '/api-tokens')).json as { id: string; name: string }[];
    const mine = list.find((t) => t.name === 'read-only pipeline')!;
    await session(page, `/api-tokens/${mine.id}`, { method: 'DELETE' });

    const after = await asToken(page, secret, '/nodes');
    expect(after.status).toBe(401);
  });

  test('the secret is never handed back once it is issued', async ({ page }) => {
    const main = await openSettings(page);
    await activatePro(main);

    const created = (
      await session(page, '/api-tokens', {
        method: 'POST',
        body: { name: 'deploy', role: 'operator' },
      })
    ).json as { id: string; token: string; hint: string };

    const listing = JSON.stringify((await session(page, '/api-tokens')).json);
    // The hint is fine; the rest of the secret must not be recoverable from the API.
    expect(listing).not.toContain(created.token.slice(12));
    expect(listing).toContain(created.hint.replace('…', ''));

    await session(page, `/api-tokens/${created.id}`, { method: 'DELETE' });
    // Back to Community for whatever runs next.
    await licenceCard(main).getByRole('button', { name: 'Remove' }).first().click();
  });
});
