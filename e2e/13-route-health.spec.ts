import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// A published route used to stop being watched the moment you looked away: `check()` was reachable
// only from the heart button, so a dead tunnel kept its green "Healthy" badge for as long as nobody
// happened to click it. Five of Paul's own routes were down for days, all five reading Healthy.
//
// This boots a real install holding a route that cannot possibly answer, and asserts the badge
// turns itself red. Nothing here ever clicks the heart — if the badge changes, something is
// watching. The 530 a real dead tunnel returns (the `Error 1033` page) cannot be produced without
// owning a hostname and a certificate, so the status-code-to-verdict mapping is covered by unit
// tests in `probe.spec.ts`; what is covered here is the part they cannot reach: that the loop runs.

const REPO = resolve(process.cwd());
const requireFromServer = createRequire(join(REPO, 'apps/server/package.json'));
const Database = requireFromServer('better-sqlite3') as typeof import('better-sqlite3').default;
const CLI = join(REPO, 'apps/server/dist/cli.js');
const PORT = 5102;
const USER = 'admin';
const PASS = 'e2e-password-123';

// `.invalid` is reserved by RFC 2606: it can never resolve, on any network, including CI's.
const DEAD_HOST = 'dead-route.invalid';

let server: ChildProcess;
let dataDir: string;

async function waitUntilUp(): Promise<void> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/setup/status`)).ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('the server never came up');
    await new Promise((r) => setTimeout(r, 500));
  }
}

function boot(): ChildProcess {
  return spawn(
    process.execPath,
    [CLI, 'start', '--foreground', '--port', String(PORT), '--host', '127.0.0.1', '--no-open'],
    { env: { ...process.env, PUENTE_DATA_DIR: dataDir }, stdio: 'ignore' },
  );
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((done) => {
    child.once('exit', () => done());
    child.kill();
  });
}

/**
 * A provisioned node with one published route pointing at a hostname that cannot resolve, recorded
 * as `healthy` — the exact state the bug left behind. Seeded between two boots so the schema comes
 * from the migration runner rather than from a fixture that would rot.
 */
function seedDeadRoute(): void {
  const db = new Database(join(dataDir, 'data.db'));
  db.pragma('journal_mode = WAL');
  const t = Date.now();
  const ws = db.prepare(`SELECT id FROM workspaces LIMIT 1`).get() as { id: string } | undefined;
  const workspaceId = ws?.id ?? null;

  const updated = db
    .prepare(`UPDATE settings SET health_poll_seconds = 5, updated_at = ? WHERE id = 'app'`)
    .run(t);
  if (updated.changes === 0) {
    db.prepare(
      `INSERT INTO settings (id, health_poll_seconds, created_at, updated_at) VALUES ('app', 5, ?, ?)`,
    ).run(t, t);
  }

  db.prepare(
    `INSERT INTO nodes (id, workspace_id, name, kind, tunnel_id, tunnel_name, provision_state,
       connector_run_state, tunnel_status, service_installed, created_at, updated_at)
     VALUES ('node_watch', ?, 'watched-box', 'local', 'tun_watch', 'puente-watched-box',
             'provisioned', 'running', 'healthy', 1, ?, ?)`,
  ).run(workspaceId, t, t);

  db.prepare(
    `INSERT INTO routes (id, workspace_id, node_id, hostname, subdomain, zone_id, zone_name, service,
       enabled, status, health, created_at, updated_at)
     VALUES ('route_watch', ?, 'node_watch', ?, 'dead-route', 'zone_watch', 'invalid', ?,
             1, 'active', 'healthy', ?, ?)`,
  ).run(
    workspaceId,
    DEAD_HOST,
    JSON.stringify({ protocol: 'http', host: 'localhost', port: 9 }),
    t,
    t,
  );
  db.close();
}

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'puente-route-health-'));
  mkdirSync(dataDir, { recursive: true });

  // First boot only to let the migration runner create today's schema.
  const scaffold = boot();
  await waitUntilUp();
  await stop(scaffold);

  seedDeadRoute();

  server = boot();
  await waitUntilUp();
});

test.afterAll(async () => {
  if (server) await stop(server);
});

test('a route nobody is looking at stops claiming to be healthy', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  if (await page.locator('#confirm').count()) await page.fill('#confirm', PASS);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`127\\.0\\.0\\.1:${PORT}/$`));

  await page.locator('a[href="/routes"]').first().click();
  await expect(page.getByText(DEAD_HOST)).toBeVisible();

  // No click on the heart anywhere in this test: the poller has to do this on its own.
  await expect(page.getByText('Unhealthy').first()).toBeVisible({ timeout: 60_000 });
});

test('and it records why, so the panel can say more than "red"', async () => {
  const login = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const { token } = (await login.json()) as { token: string };

  const res = await fetch(`http://127.0.0.1:${PORT}/api/routes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const routes = (await res.json()) as {
    hostname: string;
    health: string;
    lastError: string | null;
    lastCheckedAt: string | null;
  }[];

  const watched = routes.find((r) => r.hostname === DEAD_HOST);
  expect(watched).toBeDefined();
  expect(watched!.health).toBe('unhealthy');
  expect(watched!.lastError).toBeTruthy();
  expect(watched!.lastCheckedAt).toBeTruthy();
});
