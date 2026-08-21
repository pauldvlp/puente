import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The upgrade path, which is the one nobody tests until it breaks someone's install.
//
// This builds a database with the schema puente 0.2.0 actually shipped — read from a fixture
// captured off the v0.2.0 tag, not from today's code — fills it with a node, a route and a
// connected Cloudflare account, then boots the current binary on top of it. What is asserted is
// what the user cares about: their stuff is still there and the panel still works.

const REPO = resolve(process.cwd());
// better-sqlite3 belongs to apps/server, not to the workspace root where this spec runs.
const requireFromServer = createRequire(join(REPO, 'apps/server/package.json'));
const Database = requireFromServer('better-sqlite3') as typeof import('better-sqlite3').default;
const CLI = join(REPO, 'apps/server/dist/cli.js');
const SCHEMA = readFileSync(join(REPO, 'e2e/fixtures/schema-0.2.0.sql'), 'utf8');
const PORT = 5101;
const USER = 'admin';
const PASS = 'e2e-password-123';

let server: ChildProcess;
let dataDir: string;

/** A 0.2.0 install: connected to Cloudflare, one node, one published route. */
function seedLegacyDatabase(dir: string): void {
  const db = new Database(join(dir, 'data.db'));
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const t = Date.now();
  db.prepare(
    `INSERT INTO settings (id, cloudflare_auth_mode, cloudflare_api_token_enc, cloudflare_account_id,
       cloudflare_account_name, default_zone_id, health_poll_seconds, created_at, updated_at)
     VALUES ('app', 'token', 'legacy-encrypted-token', 'acct_legacy', 'Northwind Studio', 'zone_legacy', 45, ?, ?)`,
  ).run(t, t);
  db.prepare(
    `INSERT INTO zones (id, name, status, account_id, updated_at)
     VALUES ('zone_legacy', 'northwind.example', 'active', 'acct_legacy', ?)`,
  ).run(t);
  db.prepare(
    `INSERT INTO nodes (id, name, kind, ssh_host, ssh_port, ssh_username, tunnel_id, tunnel_name,
       provision_state, connector_run_state, tunnel_status, service_installed, os, arch,
       created_at, updated_at)
     VALUES ('node_legacy', 'vps-fra', 'ssh', '10.0.0.9', 22, 'root', 'tun_legacy', 'puente-vps-fra',
             'provisioned', 'running', 'healthy', 1, 'linux', 'amd64', ?, ?)`,
  ).run(t, t);
  db.prepare(
    `INSERT INTO routes (id, node_id, hostname, subdomain, zone_id, zone_name, service, enabled,
       status, health, created_at, updated_at)
     VALUES ('route_legacy', 'node_legacy', 'app.northwind.example', 'app', 'zone_legacy',
             'northwind.example', ?, 1, 'active', 'healthy', ?, ?)`,
  ).run(JSON.stringify({ protocol: 'http', host: 'localhost', port: 3000 }), t, t);
  db.close();
}

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'puente-upgrade-'));
  mkdirSync(dataDir, { recursive: true });
  seedLegacyDatabase(dataDir);

  server = spawn(
    process.execPath,
    [CLI, 'start', '--foreground', '--port', String(PORT), '--host', '127.0.0.1', '--no-open'],
    { env: { ...process.env, PUENTE_DATA_DIR: dataDir }, stdio: 'ignore' },
  );

  // Wait for it to answer rather than sleeping a fixed amount.
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/setup/status`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('the upgraded server never came up');
    await new Promise((r) => setTimeout(r, 500));
  }
});

test.afterAll(() => {
  server?.kill();
});

test('an install from 0.2.0 keeps its Cloudflare connection after the upgrade', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/setup/status`);
  const status = (await res.json()) as { hasAdmin: boolean; cloudflareConnected: boolean };

  expect(status.hasAdmin).toBe(false); // this fixture has no user; the data is what matters
  expect(status.cloudflareConnected).toBe(true);
});

test('the node and route that existed before are still there, in the panel', async ({ page }) => {
  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.fill('#confirm', PASS);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`127\\.0\\.0\\.1:${PORT}/$`));

  await page.locator('a[href="/nodes"]').first().click();
  await expect(page.getByText('vps-fra')).toBeVisible();

  await page.locator('a[href="/routes"]').first().click();
  await expect(page.getByText('app.northwind.example')).toBeVisible();
});

test('the migrated install has exactly one workspace, holding the old account', async () => {
  // Log in for a token: /api/workspaces is behind auth like everything else.
  const login = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const { token } = (await login.json()) as { token: string };

  const res = await fetch(`http://127.0.0.1:${PORT}/api/workspaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const workspaces = (await res.json()) as {
    name: string;
    isDefault: boolean;
    cloudflareConnected: boolean;
    cloudflareAccountName: string | null;
  }[];

  expect(workspaces).toHaveLength(1);
  expect(workspaces[0]).toMatchObject({
    // Named after the Cloudflare account it inherited, not "Default".
    name: 'Northwind Studio',
    isDefault: true,
    cloudflareConnected: true,
    cloudflareAccountName: 'Northwind Studio',
  });
});

test('the app-wide preference survives the columns being moved out from under it', async () => {
  const login = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const { token } = (await login.json()) as { token: string };

  const res = await fetch(`http://127.0.0.1:${PORT}/api/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const settings = (await res.json()) as {
    healthPollSeconds: number;
    defaultZoneId: string | null;
  };

  expect(settings.healthPollSeconds).toBe(45); // set in the fixture, not the default 30
  expect(settings.defaultZoneId).toBe('zone_legacy'); // moved onto the workspace, still readable
});
