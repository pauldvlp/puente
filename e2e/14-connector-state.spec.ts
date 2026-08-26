import { expect, test } from '@playwright/test';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// "Connector · Running" was a badge that could not go out. The run-state check asked
// `pgrep -f 'cloudflared tunnel run'`, and `-f` matches whole command lines — including the
// command line of the `bash -lc "<script>"` carrying the check. It found itself, every time,
// on every machine. Paul's own node sat green on Running next to a red "Tunnel · Down" with
// zero connections and a route serving Cloudflare's 1033 page; nothing was running at all.
//
// This boots a real install holding a node recorded exactly that way — provisioned, service
// installed, connector "running" — and refreshes it from the panel, the way the user does.
// The badge has to end up saying what the machine says. Where no connector runs (CI), that
// pins it to Stopped, and the old code cannot pass. The shell-level proof that the pattern no
// longer matches its own carrier is in `cloudflared.service.spec.ts`.

const REPO = resolve(process.cwd());
const requireFromServer = createRequire(join(REPO, 'apps/server/package.json'));
const Database = requireFromServer('better-sqlite3') as typeof import('better-sqlite3').default;
const CLI = join(REPO, 'apps/server/dist/cli.js');
const PORT = 5103;
const USER = 'admin';
const PASS = 'e2e-password-123';

let server: ChildProcess;
let dataDir: string;
let stubBin: string;

/**
 * Stubs ahead of the real binaries on PATH.
 *
 * `systemctl` knows about nothing, which pins the run to the branch that was broken — the one
 * taken on every machine whose connector is not a service unit, exactly the state a node lands
 * in when provisioning leaves no unit behind. Without it a host that happens to have
 * `cloudflared.service` answers from systemd and never reaches the process check at all.
 *
 * `cloudflared` records what it was asked to do and does nothing, so a test can assert on the
 * machine the server tried to touch. It also keeps this suite from reaching for the real one:
 * running it against a developer's own machine used to uninstall their connector.
 */
function stubBinaries(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'systemctl'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  writeFileSync(join(dir, 'cloudflared'), `#!/bin/sh\necho "$@" >> ${join(dir, 'calls.log')}\n`, {
    mode: 0o755,
  });
}

function cloudflaredCalls(): string {
  const log = join(stubBin, 'calls.log');
  return existsSync(log) ? readFileSync(log, 'utf8') : '';
}

/**
 * Ground truth, asked without a shell.
 *
 * `-x` matches the executable name, and `execFile` runs pgrep with no shell wrapping it — so
 * this oracle cannot fall for the command-line self-match it is here to catch.
 */
function aConnectorIsRunning(): Promise<boolean> {
  return new Promise((done) => {
    execFile('pgrep', ['-x', 'cloudflared'], (err) => done(!err));
  });
}

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
    {
      env: { ...process.env, PUENTE_DATA_DIR: dataDir, PATH: `${stubBin}:${process.env.PATH}` },
      stdio: 'ignore',
    },
  );
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((done) => {
    child.once('exit', () => done());
    child.kill();
  });
}

/** A local node stored in the state the bug left behind: live on paper, nothing running. */
function seedNodeClaimingToRun(): void {
  const db = new Database(join(dataDir, 'data.db'));
  db.pragma('journal_mode = WAL');
  const t = Date.now();
  const ws = db.prepare(`SELECT id FROM workspaces LIMIT 1`).get() as { id: string } | undefined;

  db.prepare(
    `INSERT INTO nodes (id, workspace_id, name, kind, tunnel_id, tunnel_name, provision_state,
       connector_run_state, tunnel_status, service_installed, os, arch, created_at, updated_at)
     VALUES ('node_claim', ?, 'claims-to-run', 'local', 'tun_claim', 'puente-claims-to-run',
             'provisioned', 'running', 'down', 1, 'linux', 'amd64', ?, ?)`,
  ).run(ws?.id ?? null, t, t);
  db.close();
}

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'puente-connector-state-'));
  mkdirSync(dataDir, { recursive: true });
  stubBin = join(dataDir, 'stub-bin');
  stubBinaries(stubBin);

  // First boot only to let the migration runner create today's schema.
  const scaffold = boot();
  await waitUntilUp();
  await stop(scaffold);

  seedNodeClaimingToRun();

  server = boot();
  await waitUntilUp();
});

test.afterAll(async () => {
  if (server) await stop(server);
});

test('the connector badge reports the machine, not a stored guess', async ({ page }) => {
  test.setTimeout(90_000);
  const truth = await aConnectorIsRunning();

  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  if (await page.locator('#confirm').count()) await page.fill('#confirm', PASS);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`127\\.0\\.0\\.1:${PORT}/$`));

  await page.locator('a[href="/nodes"]').first().click();
  await expect(page.getByText('claims-to-run')).toBeVisible();

  await page.getByRole('button', { name: 'Refresh status' }).click();

  const connector = page.getByText('Connector', { exact: true }).locator('..');
  await expect(connector).toHaveText(new RegExp(truth ? 'Running' : 'Stopped'), {
    timeout: 30_000,
  });
  if (!truth) await expect(connector).not.toHaveText(/Running/);
});

test('and the API agrees with the machine', async () => {
  const truth = await aConnectorIsRunning();

  const login = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  expect(login.ok, `login failed: ${await login.clone().text()}`).toBe(true);
  const { token } = (await login.json()) as { token: string };

  const res = await fetch(`http://127.0.0.1:${PORT}/api/nodes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok, `GET /api/nodes failed: ${await res.clone().text()}`).toBe(true);
  const nodes = (await res.json()) as { name: string; connectorRunState: string }[];

  const node = nodes.find((n) => n.name === 'claims-to-run');
  expect(node).toBeDefined();
  expect(node!.connectorRunState).toBe(truth ? 'running' : 'stopped');
});

test("removing a node it never provisioned leaves the machine's connector alone", async () => {
  // Teardown ran unprompted on delete, so a node puente had only ever been told about — no
  // tunnel, never provisioned — still took `cloudflared service uninstall` to the machine. That
  // is how this repo's own e2e suite kept wiping the connector of whoever ran it.
  const login = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  const { token } = (await login.json()) as { token: string };
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const del = (id: string): Promise<Response> =>
    fetch(`http://127.0.0.1:${PORT}/api/nodes/${id}`, { method: 'DELETE', headers: auth });

  // A node puente did provision still gets its connector torn down — and this proves the stub
  // sees the teardown at all, so the assertion below cannot pass by measuring nothing.
  const seeded = cloudflaredCalls().length;
  expect((await del('node_claim')).ok).toBe(true);
  expect(cloudflaredCalls().slice(seeded)).toContain('service uninstall');

  const created = await fetch(`http://127.0.0.1:${PORT}/api/nodes`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: 'never-provisioned', kind: 'local' }),
  });
  expect(created.ok, `create failed: ${await created.clone().text()}`).toBe(true);
  const { id } = (await created.json()) as { id: string };

  const before = cloudflaredCalls().length;
  expect((await del(id)).ok).toBe(true);
  expect(cloudflaredCalls().slice(before)).not.toContain('service uninstall');
});
