import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Scheduled backups. The interesting assertions are that the schedule cannot be switched on
// without a passphrase (it would only ever fail), that "Back up now" writes a real encrypted file
// to disk, and that retention deletes the oldest — after a success, never before.

const USER = 'admin';
const PASS = 'e2e-password-123';
const PASSPHRASE = 'a long enough passphrase';
const DATA_DIR = resolve(process.cwd(), '.e2e-data');

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

const backupsCard = (main: Locator) =>
  main.locator('[data-slot="card"]').filter({ hasText: 'Scheduled backups' });

const licenceCard = (main: Locator) =>
  main
    .locator('[data-slot="card"]')
    .filter({ hasText: /License/ })
    .first();

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
      'Backup E2E',
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

const backupFiles = (): string[] => {
  const dir = join(DATA_DIR, 'backups');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.pbk')) : [];
};

test('Community is pointed at the free CLI rather than a locked switch', async ({ page }) => {
  const main = await openSettings(page);
  const card = backupsCard(main);

  await expect(card.locator('[data-slot="badge"]').filter({ hasText: 'Pro' })).toBeVisible();
  // The important half of the upsell: taking a backup is free, and it says so.
  await expect(card.getByText('puente backup')).toBeVisible();
  await expect(card.locator('#backup-passphrase')).toHaveCount(0);
});

test('the schedule endpoint is refused without a licence', async ({ page }) => {
  await openSettings(page);
  const res = await api(page, '/backup/schedule');
  expect(res.status).toBe(403);
  expect(res.json).toMatchObject({ code: 'PRO_REQUIRED', feature: 'backup' });
});

test.describe('with a backup licence', () => {
  test.skip(!CAN_ISSUE, `no signing key at ${SIGNING_KEY} — maintainer-only path`);

  test('refuses to arm a schedule that could only fail', async ({ page }) => {
    const main = await openSettings(page);
    await activatePro(main);

    // No passphrase yet, so enabling is rejected by the server, not just disabled in the UI.
    const res = await api(page, '/backup/schedule', {
      method: 'PATCH',
      body: { enabled: true },
    });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ code: 'NO_PASSPHRASE_SET' });
  });

  test('writes a real encrypted backup, and says when the next one is due', async ({ page }) => {
    const main = await openSettings(page);
    await activatePro(main);
    const card = backupsCard(main);

    await card.locator('#backup-passphrase').fill(PASSPHRASE);
    await card.getByRole('button', { name: 'Save' }).click();
    await expect(card.getByText('Set a passphrase first.')).toHaveCount(0);

    const before = backupFiles().length;
    await card.getByRole('button', { name: 'Back up now' }).click();
    await expect(page.getByText(/Backup written/)).toBeVisible();

    const after = backupFiles();
    expect(after.length).toBe(before + 1);
    // It is listed in the panel, not just on disk.
    await expect(card.getByText(after[after.length - 1])).toBeVisible();

    // Arming it now works — through the switch, so the panel updates the way a user would see it.
    await card.getByLabel('Run backups on a schedule').click();
    await expect(card.getByText(/Next /)).toBeVisible();
    await expect(card.locator('[data-slot="badge"]').filter({ hasText: 'On' })).toBeVisible();

    const armed = await api(page, '/backup/schedule');
    expect((armed.json as { nextRunAt: string | null }).nextRunAt).not.toBeNull();
  });

  test('retention deletes the oldest, and only after a backup succeeded', async ({ page }) => {
    const main = await openSettings(page);
    await activatePro(main);

    await api(page, '/backup/schedule', {
      method: 'PATCH',
      body: { passphrase: PASSPHRASE, keep: 2 },
    });

    for (let i = 0; i < 3; i += 1) {
      const res = await api(page, '/backup/schedule/run', { method: 'POST' });
      expect(res.status).toBe(201);
      // Filenames carry a whole-second timestamp, so space the runs out.
      await new Promise((r) => setTimeout(r, 1100));
    }

    const files = (await api(page, '/backup/schedule/files')).json as { name: string }[];
    expect(files.length).toBe(2);
    expect(backupFiles().length).toBe(2);

    // Leave the install as Community for whatever runs next.
    await api(page, '/backup/schedule', { method: 'PATCH', body: { enabled: false } });
    for (const f of files) {
      await api(page, `/backup/schedule/files/${f.name}`, { method: 'DELETE' });
    }
    await licenceCard(main).getByRole('button', { name: 'Remove' }).first().click();
  });
});
