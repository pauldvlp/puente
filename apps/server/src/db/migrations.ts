import type Database from 'better-sqlite3';

/**
 * Schema evolution for a database that has no migration runner.
 *
 * puente creates its schema with idempotent `CREATE TABLE IF NOT EXISTS`, which is enough until a
 * shipped table has to *change*. These functions fill that gap: each one is safe to run on every
 * boot, on a fresh database and on one that has been in production since 0.1.0.
 *
 * Rules for anything added here:
 *   - idempotent, always. It runs on every single start.
 *   - one transaction, so a crash halfway leaves the database as it was.
 *   - never destructive without moving the data first.
 */

const DEFAULT_WORKSPACE_ID = 'ws_default';

export interface MigrationReport {
  /** Columns added to existing tables. */
  columnsAdded: string[];
  /** True when this run created the first workspace. */
  workspaceCreated: boolean;
  /** Rows given a workspace. */
  rowsAssigned: number;
  /** True when the Cloudflare connection was lifted out of `settings`. */
  connectionMoved: boolean;
}

function columnExists(sqlite: Database.Database, table: string, column: string): boolean {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((c) => c.name === column);
}

function tableExists(sqlite: Database.Database, table: string): boolean {
  const row = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return Boolean(row);
}

/**
 * Introduces workspaces: several Cloudflare accounts side by side instead of one connection
 * bolted to the app itself.
 *
 * An install from before this change has its account in `settings`, and nodes, routes and zones
 * that belong to nobody. Both are fixed here — the connection moves into a workspace named after
 * the Cloudflare account, and everything that existed is assigned to it, so the panel looks and
 * behaves exactly as it did before.
 */
export function migrateToWorkspaces(sqlite: Database.Database, now: number): MigrationReport {
  const report: MigrationReport = {
    columnsAdded: [],
    workspaceCreated: false,
    rowsAssigned: 0,
    connectionMoved: false,
  };

  const run = sqlite.transaction(() => {
    // 1. Tables that predate workspaces need the column. New installs already have it.
    for (const table of ['zones', 'nodes', 'routes']) {
      if (tableExists(sqlite, table) && !columnExists(sqlite, table, 'workspace_id')) {
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN workspace_id TEXT`);
        report.columnsAdded.push(`${table}.workspace_id`);
      }
    }

    // 2. There is always exactly one workspace after this, even on a fresh database: code that
    //    reads "the current workspace" must never have to handle its absence.
    const existing = sqlite.prepare('SELECT COUNT(*) AS n FROM workspaces').get() as { n: number };
    if (existing.n === 0) {
      const legacy = readLegacyConnection(sqlite);
      sqlite
        .prepare(
          `INSERT INTO workspaces (id, name, cloudflare_auth_mode, cloudflare_api_token_enc,
             cloudflare_account_id, cloudflare_account_name, default_zone_id, is_default,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          DEFAULT_WORKSPACE_ID,
          legacy?.accountName || 'Default',
          legacy?.authMode ?? null,
          legacy?.tokenEnc ?? null,
          legacy?.accountId ?? null,
          legacy?.accountName ?? null,
          legacy?.defaultZoneId ?? null,
          now,
          now,
        );
      report.workspaceCreated = true;
      report.connectionMoved = Boolean(legacy?.tokenEnc || legacy?.authMode);
    }

    // 3. Anything that predates workspaces belongs to the default one.
    const target = (
      sqlite
        .prepare('SELECT id FROM workspaces ORDER BY is_default DESC, created_at LIMIT 1')
        .get() as { id: string } | undefined
    )?.id;
    if (target) {
      for (const table of ['zones', 'nodes', 'routes']) {
        if (!tableExists(sqlite, table)) continue;
        const result = sqlite
          .prepare(`UPDATE ${table} SET workspace_id = ? WHERE workspace_id IS NULL`)
          .run(target);
        report.rowsAssigned += result.changes;
      }
    }

    // 4. One source of truth. Leaving the credentials in `settings` as well is how they drift.
    if (columnExists(sqlite, 'settings', 'cloudflare_api_token_enc')) {
      for (const column of [
        'cloudflare_auth_mode',
        'cloudflare_api_token_enc',
        'cloudflare_account_id',
        'cloudflare_account_name',
        'default_zone_id',
      ]) {
        if (columnExists(sqlite, 'settings', column)) {
          sqlite.exec(`ALTER TABLE settings DROP COLUMN ${column}`);
        }
      }
    }

    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_nodes_workspace ON nodes(workspace_id)');
    sqlite.exec('CREATE INDEX IF NOT EXISTS idx_routes_workspace ON routes(workspace_id)');
  });

  run();
  return report;
}

interface LegacyConnection {
  authMode: string | null;
  tokenEnc: string | null;
  accountId: string | null;
  accountName: string | null;
  defaultZoneId: string | null;
}

/** The Cloudflare connection as it was stored before workspaces existed. */
function readLegacyConnection(sqlite: Database.Database): LegacyConnection | null {
  if (!columnExists(sqlite, 'settings', 'cloudflare_api_token_enc')) return null;
  const row = sqlite
    .prepare(
      `SELECT cloudflare_auth_mode AS authMode, cloudflare_api_token_enc AS tokenEnc,
              cloudflare_account_id AS accountId, cloudflare_account_name AS accountName,
              default_zone_id AS defaultZoneId
         FROM settings WHERE id = 'app'`,
    )
    .get() as LegacyConnection | undefined;
  return row ?? null;
}

/**
 * Gives every existing account a role.
 *
 * An install from before teams has exactly one user who could do everything, so they become the
 * owner. Anything else would lock somebody out of their own panel on an upgrade.
 */
export function migrateToRoles(sqlite: Database.Database): boolean {
  if (!tableExists(sqlite, 'users')) return false;
  if (columnExists(sqlite, 'users', 'role')) return false;
  sqlite.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner'`);
  return true;
}
