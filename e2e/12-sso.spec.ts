import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFakeIdp, type FakeIdp } from './fixtures/fake-idp';

// Single sign-on, walked the way a person walks it: the owner fills the form, signs out, presses
// the button, is bounced to a provider and comes back signed in. The provider is real HTTP with a
// real RS256 key (see fixtures/fake-idp.ts), so the id_token is verified against a live JWKS and
// the PKCE verifier is checked the way a provider checks it.

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

async function signOut(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.removeItem('puente_token'));
  await page.goto('/login');
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

const card = (main: Locator, text: RegExp) =>
  main.locator('[data-slot="card"]').filter({ hasText: text }).first();

/** By its heading, not by its text: the licence card lists "Single sign-on (OIDC)" as a feature,
 *  and matching on that would configure the wrong panel. */
const ssoCard = (page: Page) =>
  page
    .getByRole('main')
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText('Single sign-on', { exact: true }) })
    .first();

async function openSettings(page: Page): Promise<Locator> {
  await page.locator('a[href="/settings"]').first().click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Settings' })).toBeVisible();
  return main;
}

async function activateEnterprise(page: Page): Promise<void> {
  const main = await openSettings(page);
  const badge = main.locator('[data-slot="badge"]').filter({ hasText: 'puente Enterprise' });
  if (await badge.count()) return;
  const remove = card(main, /License/).getByRole('button', { name: 'Remove' });
  if (await remove.count()) await remove.first().click();
  await expect(main.locator('#license-key')).toBeVisible();
  const key = execFileSync(
    process.execPath,
    [
      ISSUER,
      '--licensee',
      'SSO E2E',
      '--email',
      'e2e@example.com',
      '--plan',
      'enterprise',
      '--key',
      SIGNING_KEY,
    ],
    { encoding: 'utf8' },
  ).trim();
  await main.locator('#license-key').fill(key);
  await main.getByRole('button', { name: 'Activate' }).click();
  await expect(badge).toBeVisible();
}

test('Community sees the offer, not a broken form, and the API refuses', async ({ page }) => {
  await signIn(page);
  await openSettings(page);
  const sso = ssoCard(page);

  await expect(sso.locator('[data-slot="badge"]').filter({ hasText: 'Pro' })).toBeVisible();
  await expect(sso.locator('#sso-issuer')).toHaveCount(0);

  const res = await api(page, '/sso/config', {
    method: 'PATCH',
    body: { issuer: 'https://example.com', clientId: 'x' },
  });
  expect(res.status).toBe(403);
  expect(res.json).toMatchObject({ code: 'PRO_REQUIRED', feature: 'sso' });

  // And the login screen offers nothing, because there is nothing to offer.
  const status = await page.evaluate(async () => {
    const r = await fetch('/api/sso/status');
    return r.json() as Promise<{ enabled: boolean }>;
  });
  expect(status.enabled).toBe(false);
  await signOut(page);
  await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0);
});

test.describe('with an enterprise licence', () => {
  test.skip(!CAN_ISSUE, `no signing key at ${SIGNING_KEY} — maintainer-only path`);

  let idp: FakeIdp;

  test.beforeAll(async () => {
    idp = await startFakeIdp();
  });

  test.afterAll(async () => {
    await idp.close();
  });

  /** Fill the form as an owner would, and turn it on. */
  async function configure(page: Page, allowedDomain = ''): Promise<void> {
    await openSettings(page);
    const sso = ssoCard(page);
    await expect(sso.locator('#sso-issuer')).toBeVisible();
    await sso.locator('#sso-issuer').fill(idp.issuer);
    await sso.locator('#sso-label').fill('Acme ID');
    await sso.locator('#sso-client-id').fill(idp.clientId);
    await sso.locator('#sso-client-secret').fill(idp.clientSecret);
    await sso.locator('#sso-domain').fill(allowedDomain);
    const toggle = sso.getByLabel('Show the sign-in button');
    if (!(await toggle.isChecked())) await toggle.click();
    await sso.getByRole('button', { name: 'Save' }).click();
    await expect(sso.locator('[data-slot="badge"]').filter({ hasText: 'On' })).toBeVisible();
  }

  test('an owner sets it up and someone signs in with the button', async ({ page }) => {
    await signIn(page);
    await activateEnterprise(page);
    await configure(page);

    // The value the owner has to register with the provider must be the one puente will send.
    const sso = ssoCard(page);
    await expect(sso.getByText(/\/api\/sso\/callback$/)).toBeVisible();

    idp.signInAs({ email: 'dana@example.com', sub: 'dana', name: 'Dana' });
    await signOut(page);

    const button = page.getByRole('button', { name: 'Continue with Acme ID' });
    await expect(button).toBeVisible();
    await button.click();

    // Provider → callback → one-time code → session. Ends up inside the panel.
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/, { timeout: 15_000 });
    await expect(page.getByRole('main')).toBeVisible();

    // The account exists under the email, and it was PKCE that got it there.
    const form = idp.lastTokenRequest();
    expect(form?.get('code_verifier')).toBeTruthy();
    expect(form?.get('grant_type')).toBe('authorization_code');

    const me = await api(page, '/auth/me');
    expect(me.json).toMatchObject({ username: 'dana@example.com' });

    // Nothing worth stealing is left in the URL once the swap is done.
    expect(new URL(page.url()).search).toBe('');
  });

  test('an email outside the allowed domain is turned away, by name', async ({ page }) => {
    await signIn(page);
    await configure(page, 'example.com');

    idp.signInAs({ email: 'outsider@elsewhere.test', sub: 'outsider' });
    await signOut(page);
    await page.getByRole('button', { name: 'Continue with Acme ID' }).click();

    await expect(page.getByRole('alert')).toContainText(/example\.com/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => localStorage.getItem('puente_token'))).toBeNull();
  });

  test('a provider that refuses says so rather than hanging', async ({ page }) => {
    await signIn(page);
    await configure(page);
    await signOut(page);

    idp.refuseNext('access_denied');
    await page.getByRole('button', { name: 'Continue with Acme ID' }).click();

    await expect(page.getByRole('alert')).toContainText('access_denied', { timeout: 15_000 });
  });

  test('the hand-off code cannot be spent twice', async ({ page }) => {
    await signIn(page);
    await configure(page);
    idp.signInAs({ email: 'dana@example.com', sub: 'dana' });
    await signOut(page);

    // Walk the redirects outside the page, so the code is ours to spend rather than the app's.
    // (A page-side fetch cannot: the hop through the provider is cross-origin.)
    const landed = await page.request.get('/api/sso/start');
    const code = new URL(landed.url()).searchParams.get('sso');
    expect(code).toBeTruthy();

    const first = await api(page, '/sso/exchange', { method: 'POST', body: { code } });
    expect(first.status).toBe(201);
    expect(first.json).toMatchObject({ user: { username: 'dana@example.com' } });

    const second = await api(page, '/sso/exchange', { method: 'POST', body: { code } });
    expect(second.status).toBe(401);
  });

  test('a lapsed licence stops new setup, never the sign-in itself', async ({ page }) => {
    await signIn(page);
    await configure(page);

    // Drop the licence the way an expiry would leave things: configured, but unlicensed.
    const main = await openSettings(page);
    await card(main, /License/)
      .getByRole('button', { name: 'Remove' })
      .first()
      .click();
    await expect(main.locator('#license-key')).toBeVisible();

    // Changing it is Pro...
    const refused = await api(page, '/sso/config', {
      method: 'PATCH',
      body: { enabled: false },
    });
    expect(refused.status).toBe(403);

    // ...but the company still gets into its own panel.
    idp.signInAs({ email: 'dana@example.com', sub: 'dana' });
    await signOut(page);
    await page.getByRole('button', { name: 'Continue with Acme ID' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/, { timeout: 15_000 });
  });
});
