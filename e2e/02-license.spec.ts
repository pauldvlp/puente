import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// End-to-end cover for the paid edition's front door: what a Community user sees, what a bad key
// does, and the full activate → verify → remove round trip against the built server and the built
// SPA. Files are numbered because the run shares one SQLite: 01 registers the admin this needs.
//
// Issuing a real key needs the maintainer's Ed25519 private key, which by design exists only on
// the maintainer's machine and never in CI. Same shape as the live Cloudflare spec: the Pro half
// skips wherever the key is absent, and reports as skipped rather than passing silently.

const USER = 'admin';
const PASS = 'e2e-password-123';

const SIGNING_KEY =
  process.env.PUENTE_LICENSE_SIGNING_KEY ?? join(homedir(), '.puente-licensing', 'signing-key.pem');
const CAN_ISSUE = existsSync(SIGNING_KEY);
const ISSUER = resolve(process.cwd(), 'scripts/license/issue.mjs');

function issueKey(plan: 'pro' | 'agency' = 'agency'): string {
  return execFileSync(
    process.execPath,
    [
      ISSUER,
      '--licensee',
      'E2E Test Company',
      '--email',
      'e2e@example.com',
      '--plan',
      plan,
      '--months',
      '12',
      '--key',
      SIGNING_KEY,
    ],
    { encoding: 'utf8' },
  ).trim();
}

async function openSettings(page: Page): Promise<Locator> {
  await page.goto('/login');
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await page.locator('a[href="/settings"]').first().click();
  // Two headings say "Settings" — the top bar's and the page's. Scope everything to the page.
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Settings' })).toBeVisible();
  return main;
}

/** The edition badge. `data-slot` comes from the Badge primitive, so it is stable. */
const editionBadge = (main: Locator, text: string) =>
  main.locator('[data-slot="badge"]').filter({ hasText: text }).first();

test('a fresh install reports Community and offers to activate a key', async ({ page }) => {
  const main = await openSettings(page);

  await expect(editionBadge(main, 'Community')).toBeVisible();
  await expect(main.getByText('You are running')).toBeVisible();
  await expect(main.locator('#license-key')).toBeVisible();
  await expect(main.getByRole('button', { name: 'Activate' })).toBeDisabled();

  // The free edition must not advertise a cap it does not have.
  await expect(main.getByText(/Unlimited nodes, unlimited routes/)).toBeVisible();

  // The upgrade link must go somewhere we own. It pointed at puente.dev — someone else's
  // domain — which would have sent paying customers to a stranger's server. Scoped to this card:
  // every Pro upsell in the panel carries the same link.
  const licenceCard = main.locator('[data-slot="card"]').filter({ hasText: 'License key' });
  const upgrade = licenceCard.getByRole('link', { name: /Compare editions/i });
  await expect(upgrade).toHaveAttribute('href', /^https:\/\/github\.com\/pauldvlp\//);
});

test('a key that is not ours is refused, and nothing changes', async ({ page }) => {
  const main = await openSettings(page);

  await main.locator('#license-key').fill('puente-lic-v1.bm90LWEtcmVhbC1rZXk.ZmFrZS1zaWduYXR1cmU');
  await main.getByRole('button', { name: 'Activate' }).click();

  await expect(page.getByText(/failed verification/i)).toBeVisible();
  await expect(editionBadge(main, 'Community')).toBeVisible();
});

test('garbage in the field is refused with a message a human can act on', async ({ page }) => {
  const main = await openSettings(page);

  await main.locator('#license-key').fill('hunter2');
  await main.getByRole('button', { name: 'Activate' }).click();

  await expect(page.getByText(/does not look like a puente license key/i)).toBeVisible();
});

test.describe('with a real signed key', () => {
  test.skip(!CAN_ISSUE, `no signing key at ${SIGNING_KEY} — maintainer-only path`);

  test('activating unlocks Pro, and removing it returns to Community', async ({ page }) => {
    const key = issueKey('agency');
    const main = await openSettings(page);

    await main.locator('#license-key').fill(key);
    await main.getByRole('button', { name: 'Activate' }).click();

    // Edition badge, licensee and the plan's features all come from the signed payload.
    await expect(editionBadge(main, 'puente Agency')).toBeVisible();
    await expect(main.getByText('E2E Test Company')).toBeVisible();
    await expect(main.getByText('Client workspaces')).toBeVisible();
    await expect(main.getByText('Fleet operations')).toBeVisible();
    await expect(main.getByText('15', { exact: true })).toBeVisible(); // seats
    await expect(main.locator('#license-key')).toHaveCount(0);

    // It survives a reload — the key is persisted, not just held in the client.
    await page.reload();
    await expect(editionBadge(main, 'puente Agency')).toBeVisible();

    await main.getByRole('button', { name: 'Remove' }).click();
    await expect(editionBadge(main, 'Community')).toBeVisible();
    await expect(main.locator('#license-key')).toBeVisible();
  });

  test('a Pro key shows only the features that plan paid for', async ({ page }) => {
    const key = issueKey('pro');
    const main = await openSettings(page);

    await main.locator('#license-key').fill(key);
    await main.getByRole('button', { name: 'Activate' }).click();

    await expect(editionBadge(main, 'puente Pro')).toBeVisible();
    await expect(main.getByText('Exportable audit log')).toBeVisible();
    // Agency-only and Enterprise-only capabilities must not appear on a Pro key.
    await expect(main.getByText('Client workspaces')).toHaveCount(0);
    await expect(main.getByText('Single sign-on (OIDC)')).toHaveCount(0);

    await main.getByRole('button', { name: 'Remove' }).click();
    await expect(editionBadge(main, 'Community')).toBeVisible();
  });
});
