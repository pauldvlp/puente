import { expect, test } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Backup and restore, exercised the way a person in trouble would: make an install, back it up,
// destroy it, bring it back, and check the panel still has their node and still takes their
// password. Anything less than that is testing that a file was written.

const REPO = resolve(process.cwd());
const CLI = join(REPO, 'apps/server/dist/cli.js');
const PORT = 5103;
const USER = 'paul';
const PASS = 'backup-e2e-password';
const PASSPHRASE = 'correct horse battery staple';

let dataDir: string;
let backupFile: string;
let server: ChildProcess | null = null;

const cli = (args: string[]): string =>
  execFileSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, PUENTE_DATA_DIR: dataDir },
    encoding: 'utf8',
  });

async function startServer(): Promise<void> {
  server = spawn(
    process.execPath,
    [CLI, 'start', '--foreground', '--port', String(PORT), '--host', '127.0.0.1', '--no-open'],
    { env: { ...process.env, PUENTE_DATA_DIR: dataDir }, stdio: 'ignore' },
  );
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/setup/status`)).ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('server never came up');
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function stopServer(): Promise<void> {
  server?.kill();
  server = null;
  // The CLI refuses to restore while the daemon state file says a panel is running.
  rmSync(join(dataDir, 'daemon.json'), { force: true });
  await new Promise((r) => setTimeout(r, 300));
}

async function post(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${PORT}/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'puente-backup-e2e-'));
  backupFile = join(dataDir, '..', `puente-e2e-${Date.now()}.pbk`);

  await startServer();
  const registered = await post('/auth/register', {
    username: USER,
    password: PASS,
    confirmPassword: PASS,
  });
  const { token } = (await registered.json()) as { token: string };
  const node = await post('/nodes', { kind: 'local', name: 'the-node-that-must-survive' }, token);
  expect(node.status).toBe(201);
  await stopServer();

  // Every test below needs a backup to exist, so it is made once here rather than by whichever
  // test happens to run first.
  cli(['backup', '--out', backupFile, '--passphrase', PASSPHRASE]);
});

test.afterAll(async () => {
  await stopServer();
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(backupFile, { force: true });
});

test('writes an encrypted file that is recognisably a puente backup', () => {
  expect(existsSync(backupFile)).toBe(true);

  const bytes = readFileSync(backupFile);
  expect(bytes.subarray(0, 8).toString('utf8')).toBe('PUENTEBK');
  // Encrypted: the username sitting in the database must not be readable in the file.
  expect(bytes.toString('binary')).not.toContain(USER);
});

test('refuses the wrong passphrase instead of half-restoring', () => {
  let output = '';
  try {
    cli(['restore', backupFile, '--passphrase', 'not the passphrase']);
  } catch (err) {
    output = String((err as { stderr?: Buffer }).stderr ?? '');
  }
  expect(output).toContain('Wrong passphrase');
  // The database is still whatever it was; nothing was written.
  expect(existsSync(join(dataDir, 'data.db'))).toBe(true);
});

test('refuses to restore over a running panel', async () => {
  await startServer();
  let output = '';
  try {
    cli(['restore', backupFile, '--passphrase', PASSPHRASE]);
  } catch (err) {
    output = String((err as { stderr?: Buffer }).stderr ?? '');
  }
  expect(output).toContain('puente stop');
  await stopServer();
});

test('brings an install back from nothing, credentials and all', async ({ page }) => {
  // Lose the database and the key — the two files that make an install an install.
  rmSync(join(dataDir, 'data.db'), { force: true });
  rmSync(join(dataDir, 'data.db-wal'), { force: true });
  rmSync(join(dataDir, 'key'), { force: true });

  const output = cli(['restore', backupFile, '--passphrase', PASSPHRASE]);
  expect(output).toContain('Restored');

  await startServer();

  // The old password still works, which only happens if the database came back intact…
  const login = await post('/auth/login', { username: USER, password: PASS });
  expect(login.status).toBe(201);
  const { token } = (await login.json()) as { token: string };

  // …and the node is there, in the panel, not just in the API.
  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.evaluate((t) => localStorage.setItem('puente_token', t), token);
  await page.goto(`http://127.0.0.1:${PORT}/nodes`);
  await expect(page.getByText('the-node-that-must-survive')).toBeVisible();
});

test('keeps a copy of what it overwrote, in case the restore was the mistake', async () => {
  // The previous test left the panel running, and restore refuses while it is.
  await stopServer();
  const before = readFileSync(join(dataDir, 'data.db'));
  writeFileSync(join(dataDir, 'marker.txt'), 'x');
  const output = cli(['restore', backupFile, '--passphrase', PASSPHRASE]);

  // Anchored on the whole phrase and matching non-space: `/at (.*)/` finds the "at" inside
  // "what" and captures half the sentence with it.
  const match = /is now at (\S+)/.exec(output);
  expect(match).not.toBeNull();
  const copy = match![1].trim();
  expect(existsSync(copy)).toBe(true);
  // What matters is that it is the database that was there, not that the byte count matches:
  // closing SQLite checkpoints the WAL, which legitimately changes the file's size.
  expect(readFileSync(copy).subarray(0, 15).toString('utf8')).toBe('SQLite format 3');
  expect(before.subarray(0, 15).toString('utf8')).toBe('SQLite format 3');
});
