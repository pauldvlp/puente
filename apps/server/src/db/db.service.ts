import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { DB_PATH, ensureDataDir } from '../config/paths';
import * as schema from './schema';

/**
 * Idempotent DDL. We ship an embedded schema bootstrap (CREATE TABLE IF NOT
 * EXISTS) instead of a separate migration runner so a fresh ~/.puente/data.db is
 * created and usable on first boot with zero extra steps. Drizzle is used for
 * all typed queries on top of these tables.
 */
const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
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

CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT,
  account_id TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  ssh_host TEXT,
  ssh_port INTEGER,
  ssh_username TEXT,
  ssh_auth_method TEXT,
  ssh_private_key_path TEXT,
  ssh_managed_key INTEGER,
  ssh_host_key_fingerprint TEXT,
  tunnel_id TEXT,
  tunnel_name TEXT,
  tunnel_token_enc TEXT,
  provision_state TEXT NOT NULL DEFAULT 'unprovisioned',
  connector_run_state TEXT NOT NULL DEFAULT 'unknown',
  tunnel_status TEXT,
  service_installed INTEGER NOT NULL DEFAULT 0,
  os TEXT,
  arch TEXT,
  cloudflared_version TEXT,
  connection_count INTEGER,
  last_error TEXT,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  subdomain TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  service TEXT NOT NULL,
  path TEXT,
  origin_request TEXT,
  dns_record_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  health TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL,
  action TEXT NOT NULL,
  message TEXT NOT NULL,
  node_id TEXT,
  route_id TEXT,
  meta TEXT
);

CREATE INDEX IF NOT EXISTS idx_routes_node ON routes(node_id);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
`;

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly sqlite: Database.Database;
  readonly db: BetterSQLite3Database<typeof schema>;

  constructor() {
    ensureDataDir();
    this.sqlite = new Database(DB_PATH);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma('busy_timeout = 5000');
    this.sqlite.exec(BOOTSTRAP_SQL);
    this.db = drizzle(this.sqlite, { schema });
  }

  onModuleDestroy(): void {
    try {
      this.sqlite.close();
    } catch {
      /* already closed */
    }
  }
}
