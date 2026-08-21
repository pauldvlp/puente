import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { migrateToWorkspaces } from './migrations';

const NOW = Date.UTC(2026, 7, 20);

/**
 * The schema exactly as 0.2.0 shipped it, frozen here on purpose. This is what is sitting on the
 * disk of anyone who installed puente before workspaces existed, and the only honest way to test a
 * migration is against the thing it has to migrate.
 */
const SCHEMA_0_2_0 = `
CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  cloudflare_auth_mode TEXT,
  cloudflare_api_token_enc TEXT,
  cloudflare_account_id TEXT,
  cloudflare_account_name TEXT,
  default_zone_id TEXT,
  health_poll_seconds INTEGER NOT NULL DEFAULT 30,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE zones (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT, account_id TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE nodes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, tunnel_id TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE routes (
  id TEXT PRIMARY KEY, node_id TEXT NOT NULL, hostname TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cloudflare_auth_mode TEXT,
  cloudflare_api_token_enc TEXT,
  cloudflare_account_id TEXT,
  cloudflare_account_name TEXT,
  default_zone_id TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

interface WorkspaceRow {
  id: string;
  name: string;
  cloudflare_api_token_enc: string | null;
  cloudflare_account_id: string | null;
  default_zone_id: string | null;
  is_default: number;
}

/** A database that looks like a real 0.2.0 install: connected to Cloudflare, with things in it. */
function legacyDb(opts: { connected?: boolean } = {}): Database.Database {
  const db = new Database(':memory:');
  db.exec(SCHEMA_0_2_0);
  db.prepare(
    `INSERT INTO settings (id, cloudflare_auth_mode, cloudflare_api_token_enc, cloudflare_account_id,
       cloudflare_account_name, default_zone_id, health_poll_seconds, created_at, updated_at)
     VALUES ('app', ?, ?, ?, ?, ?, 45, ?, ?)`,
  ).run(
    opts.connected === false ? null : 'token',
    opts.connected === false ? null : 'enc:abc123',
    opts.connected === false ? null : 'acct_9',
    opts.connected === false ? null : 'Northwind Studio',
    opts.connected === false ? null : 'zone_1',
    NOW,
    NOW,
  );
  db.prepare(`INSERT INTO zones VALUES ('zone_1', 'example.com', 'active', 'acct_9', ?)`).run(NOW);
  db.prepare(`INSERT INTO nodes VALUES ('node_1', 'vps-fra', 'ssh', 'tun_1', ?, ?)`).run(NOW, NOW);
  db.prepare(`INSERT INTO routes VALUES ('route_1', 'node_1', 'app.example.com', ?, ?)`).run(
    NOW,
    NOW,
  );
  return db;
}

const workspace = (db: Database.Database): WorkspaceRow =>
  db.prepare('SELECT * FROM workspaces LIMIT 1').get() as WorkspaceRow;

const columns = (db: Database.Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe('migrateToWorkspaces', () => {
  it('lifts an existing Cloudflare connection into a workspace named after the account', () => {
    const db = legacyDb();
    const report = migrateToWorkspaces(db, NOW);

    expect(report.workspaceCreated).toBe(true);
    expect(report.connectionMoved).toBe(true);

    const ws = workspace(db);
    expect(ws.name).toBe('Northwind Studio');
    expect(ws.cloudflare_api_token_enc).toBe('enc:abc123');
    expect(ws.cloudflare_account_id).toBe('acct_9');
    expect(ws.default_zone_id).toBe('zone_1');
    expect(ws.is_default).toBe(1);
    db.close();
  });

  it('adopts everything that already existed, so nothing disappears from the panel', () => {
    const db = legacyDb();
    const report = migrateToWorkspaces(db, NOW);

    // one zone + one node + one route
    expect(report.rowsAssigned).toBe(3);
    const ws = workspace(db);
    for (const table of ['zones', 'nodes', 'routes']) {
      const row = db.prepare(`SELECT workspace_id FROM ${table} LIMIT 1`).get() as {
        workspace_id: string;
      };
      expect(row.workspace_id).toBe(ws.id);
    }
    db.close();
  });

  it('leaves the credentials in exactly one place', () => {
    const db = legacyDb();
    migrateToWorkspaces(db, NOW);

    const settingsColumns = columns(db, 'settings');
    expect(settingsColumns).not.toContain('cloudflare_api_token_enc');
    expect(settingsColumns).not.toContain('cloudflare_account_id');
    // Genuinely app-wide settings stay where they were.
    expect(settingsColumns).toContain('health_poll_seconds');
    const poll = db.prepare(`SELECT health_poll_seconds AS p FROM settings`).get() as { p: number };
    expect(poll.p).toBe(45);
    db.close();
  });

  it('is safe to run on every boot', () => {
    const db = legacyDb();
    migrateToWorkspaces(db, NOW);
    const first = workspace(db);

    const second = migrateToWorkspaces(db, NOW + 60_000);
    expect(second.workspaceCreated).toBe(false);
    expect(second.rowsAssigned).toBe(0);
    expect(second.columnsAdded).toEqual([]);

    const count = db.prepare('SELECT COUNT(*) AS n FROM workspaces').get() as { n: number };
    expect(count.n).toBe(1);
    expect(workspace(db)).toEqual(first);
    db.close();
  });

  it('gives a never-connected install a workspace too, so nothing has to handle its absence', () => {
    const db = legacyDb({ connected: false });
    const report = migrateToWorkspaces(db, NOW);

    expect(report.workspaceCreated).toBe(true);
    expect(report.connectionMoved).toBe(false);
    const ws = workspace(db);
    expect(ws.name).toBe('Default');
    expect(ws.cloudflare_api_token_enc).toBeNull();
    db.close();
  });

  it('works on a database that already has the column, without touching it twice', () => {
    const db = legacyDb();
    db.exec('ALTER TABLE nodes ADD COLUMN workspace_id TEXT');
    const report = migrateToWorkspaces(db, NOW);

    expect(report.columnsAdded).toEqual(['zones.workspace_id', 'routes.workspace_id']);
    const row = db.prepare('SELECT workspace_id FROM nodes').get() as { workspace_id: string };
    expect(row.workspace_id).toBe(workspace(db).id);
    db.close();
  });
});
