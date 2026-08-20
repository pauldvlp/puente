import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Alerting, end to end and for real: the browser creates a channel pointing at a throwaway HTTP
// server started inside this test, presses Test, and the assertion is that the server actually
// received the POST with the documented payload. Nothing is stubbed — this exercises the licence
// gate, the encrypted URL, the dispatcher's formatting and Node's outbound fetch.

const USER = 'admin';
const PASS = 'e2e-password-123';

const SIGNING_KEY =
  process.env.PUENTE_LICENSE_SIGNING_KEY ?? join(homedir(), '.puente-licensing', 'signing-key.pem');
const CAN_ISSUE = existsSync(SIGNING_KEY);
const ISSUER = resolve(process.cwd(), 'scripts/license/issue.mjs');

interface Received {
  method: string;
  contentType: string | undefined;
  body: unknown;
}

/** A one-shot webhook receiver on a random free port. */
async function webhookServer(): Promise<{
  url: string;
  received: Received[];
  close: () => Promise<void>;
  server: Server;
}> {
  const received: Received[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      received.push({
        method: req.method ?? '',
        contentType: req.headers['content-type'],
        body: raw ? (JSON.parse(raw) as unknown) : null,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    received,
    server,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

async function openSettings(page: Page): Promise<Locator> {
  await page.goto('/login');
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  // 01 normally creates the admin; register here too so this file also passes when run alone.
  if (await page.locator('#confirm').count()) await page.fill('#confirm', PASS);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await page.locator('a[href="/settings"]').first().click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Settings' })).toBeVisible();
  return main;
}

async function activatePro(main: Locator): Promise<void> {
  const key = execFileSync(
    process.execPath,
    [
      ISSUER,
      '--licensee',
      'Alerts E2E',
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
  await expect(main.locator('[data-slot="badge"]').filter({ hasText: 'puente Pro' })).toBeVisible();
}

test('Community sees what alerting does, and that it is a Pro feature', async ({ page }) => {
  const main = await openSettings(page);

  const card = main.locator('[data-slot="card"]').filter({ hasText: 'Alerts' });
  await expect(card.locator('[data-slot="badge"]').filter({ hasText: 'Pro' })).toBeVisible();
  await expect(card.getByText(/Get told when a node stops answering/)).toBeVisible();
  // No form to fill in — the upsell explains, it does not tease a dead control.
  await expect(card.locator('#alert-url')).toHaveCount(0);
});

test.describe('with alerting unlocked', () => {
  test.skip(!CAN_ISSUE, `no signing key at ${SIGNING_KEY} — maintainer-only path`);

  test('a channel can be created and actually reaches the endpoint', async ({ page }) => {
    const hook = await webhookServer();
    try {
      const main = await openSettings(page);
      await activatePro(main);

      const card = main.locator('[data-slot="card"]').filter({ hasText: 'Alerts' });
      await card.locator('#alert-name').fill('On-call webhook');
      await card.locator('#alert-url').fill(hook.url);
      await card.getByRole('button', { name: 'Add channel' }).click();

      // Stored, and the URL is shown only as a preview — never handed back in full.
      await expect(card.getByText('On-call webhook')).toBeVisible();
      await expect(card.getByText(/127\.0\.0\.1:\d+\/hook/)).toBeVisible();

      await card.getByRole('button', { name: 'Test' }).click();
      await expect(page.getByText('Test alert delivered')).toBeVisible();

      // The real assertion: the endpoint got a POST it could act on.
      expect(hook.received).toHaveLength(1);
      const [call] = hook.received;
      expect(call.method).toBe('POST');
      expect(call.contentType).toContain('application/json');
      expect(call.body).toMatchObject({
        v: 1,
        trigger: 'node.down',
        severity: 'critical',
        subject: { kind: 'node' },
      });
      expect(String((call.body as { text: string }).text)).toContain('test');

      await card.getByRole('button', { name: 'Remove On-call webhook' }).click();
      await expect(card.getByText('On-call webhook')).toHaveCount(0);
    } finally {
      await hook.close();
      // Leave the panel as we found it, for whatever spec runs next.
      const main = page.getByRole('main');
      const remove = main.getByRole('button', { name: 'Remove' });
      if (await remove.count()) await remove.first().click();
    }
  });

  test('a Slack channel posts the shape Slack expects', async ({ page }) => {
    const hook = await webhookServer();
    try {
      const main = await openSettings(page);
      await activatePro(main);

      const card = main.locator('[data-slot="card"]').filter({ hasText: 'Alerts' });
      await card.locator('#alert-name').fill('Slack');
      await card.locator('[data-slot="select-trigger"]').first().click();
      await page.getByRole('option', { name: 'Slack' }).click();
      await card.locator('#alert-url').fill(hook.url);
      await card.getByRole('button', { name: 'Add channel' }).click();
      await card.getByRole('button', { name: 'Test' }).click();
      await expect(page.getByText('Test alert delivered')).toBeVisible();

      // Slack wants { text }, not puente's own payload.
      expect(hook.received).toHaveLength(1);
      expect(hook.received[0].body).toHaveProperty('text');
      expect(hook.received[0].body).not.toHaveProperty('trigger');

      await card.getByRole('button', { name: 'Remove Slack' }).click();
    } finally {
      await hook.close();
      const main = page.getByRole('main');
      const remove = main.getByRole('button', { name: 'Remove' });
      if (await remove.count()) await remove.first().click();
    }
  });
});
