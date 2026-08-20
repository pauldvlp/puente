import { expect, type Page, test } from '@playwright/test';

// Drives the built server serving the built SPA against a fresh (admin-less) data dir,
// so this covers the real first-run path: register → JWT → protected panel. No Cloudflare
// involved — nothing here needs a token.

const USER = 'admin';
const PASS = 'e2e-password-123';

/** Sign in from a clean browser context (the admin exists after the first test). */
async function signIn(page: Page) {
  await page.goto('/login');
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
}

test('first run registers the admin and lands in the panel', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  // no admin yet → the auth screen is in REGISTER mode (confirm only renders then)
  await expect(page.locator('#confirm')).toBeVisible();

  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.fill('#confirm', PASS);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
});

test('the panel navigates across its sections', async ({ page }) => {
  await signIn(page);

  for (const [href, label] of [
    ['/nodes', 'Nodes'],
    ['/routes', 'Routes'],
    ['/activity', 'Activity'],
    ['/settings', 'Settings'],
  ]) {
    await page.locator(`a[href="${href}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading', { name: label }).first()).toBeVisible();
  }
});

test('signing out returns to the login form and the credentials still work', async ({ page }) => {
  await signIn(page);

  await page.locator('[title="Sign out"]').click();
  await expect(page).toHaveURL(/\/login$/);
  // the admin exists now, so the form is in LOGIN mode — no confirm field
  await expect(page.locator('#confirm')).toHaveCount(0);

  await signIn(page);
});

test('the panel reports the version the server is actually running', async ({ page }) => {
  await signIn(page);
  await page.locator('a[href="/settings"]').first().click();

  // Was a hard-coded 'v0.1.0' in the JSX while the server ran 0.2.0. Compare the rendered
  // string against what the API reports, so the two can never drift apart again.
  const reported = await page.evaluate(async () => {
    const res = await fetch('/api/setup/status');
    return ((await res.json()) as { version: string }).version;
  });
  await expect(page.getByTestId('app-version')).toHaveText(`v${reported}`);
  expect(reported).toMatch(/^\d+\.\d+\.\d+/);
});

test('a protected route is not reachable without a session', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login$/);
});
