import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/** Root directory for all persisted puente state. Override with PUENTE_DATA_DIR. */
export const DATA_DIR = process.env.PUENTE_DATA_DIR || join(homedir(), '.puente');

export const DB_PATH = join(DATA_DIR, 'data.db');
/** Master key used to encrypt secrets at rest (AES-256-GCM). */
export const KEY_PATH = join(DATA_DIR, 'key');
/** Master key for signing session JWTs. */
export const JWT_SECRET_PATH = join(DATA_DIR, 'jwt.secret');
/** puente-managed SSH key pairs live here (one per bootstrapped host). */
export const KEYS_DIR = join(DATA_DIR, 'keys');
/** Downloaded cloudflared binary for the local node (when not on PATH). */
export const BIN_DIR = join(DATA_DIR, 'bin');

/** Create the data directory tree with tight permissions. Idempotent. */
export function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(BIN_DIR, { recursive: true });
}
