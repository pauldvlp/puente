import { Injectable, Logger } from '@nestjs/common';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { DbService } from '../../db/db.service';
import { DB_PATH, JWT_SECRET_PATH, KEY_PATH, ensureDataDir } from '../../config/paths';
import { APP_VERSION } from '../../config/version';
import { BackupError, open as openBackup, seal, type BackupBody } from './backup.format';

/**
 * Making and restoring a complete copy of an install.
 *
 * Free, and deliberately so: nobody should lose their tunnels because they did not pay. What Pro
 * sells is doing it *on a schedule* without anyone remembering — see ee/backup.
 */
@Injectable()
export class BackupService {
  private readonly log = new Logger('Backup');

  constructor(private readonly dbs: DbService) {}

  /**
   * A consistent copy, taken through SQLite's own backup API rather than by copying the file.
   * puente runs in WAL mode, where the .db on disk is missing whatever is still in the -wal —
   * a plain `cp` of a live database is how people end up with a backup that restores to
   * yesterday.
   */
  async create(passphrase: string): Promise<Buffer> {
    const scratch = mkdtempSync(join(tmpdir(), 'puente-backup-'));
    const snapshot = join(scratch, 'data.db');
    try {
      await this.dbs.sqlite.backup(snapshot);
      const body: BackupBody = {
        version: APP_VERSION,
        createdAt: new Date().toISOString(),
        database: readFileSync(snapshot).toString('base64'),
        masterKey: readFileSync(KEY_PATH).toString('base64'),
        jwtSecret: existsSync(JWT_SECRET_PATH) ? readFileSync(JWT_SECRET_PATH, 'utf8') : null,
      };
      return seal(body, passphrase);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

export interface RestoreReport {
  version: string;
  createdAt: string;
  /** Where the files that were there before were moved, in case this was a mistake. */
  previousCopy: string | null;
}

/**
 * Restores over the current data directory. Deliberately not a method on the service: this runs
 * from the CLI with the panel stopped, because writing a database out from under a running server
 * is how a rescue turns into a second incident.
 */
export function restoreToDataDir(file: Buffer, passphrase: string): RestoreReport {
  const body = openBackup(file, passphrase);
  const database = Buffer.from(body.database, 'base64');

  // Refuse to restore something that is not a database, before touching anything on disk.
  assertSqlite(database);

  ensureDataDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let previousCopy: string | null = null;
  if (existsSync(DB_PATH)) {
    previousCopy = `${DB_PATH}.before-restore-${stamp}`;
    copyFileSync(DB_PATH, previousCopy);
  }

  writeFileSync(DB_PATH, database, { mode: 0o600 });
  writeFileSync(KEY_PATH, Buffer.from(body.masterKey, 'base64'), { mode: 0o600 });
  if (body.jwtSecret) writeFileSync(JWT_SECRET_PATH, body.jwtSecret, { mode: 0o600 });

  // WAL and shared-memory files belong to the database we just replaced.
  for (const suffix of ['-wal', '-shm']) {
    rmSync(`${DB_PATH}${suffix}`, { force: true });
  }

  return { version: body.version, createdAt: body.createdAt, previousCopy };
}

/** A restored file that is not SQLite would leave the install unbootable, so check first. */
function assertSqlite(database: Buffer): void {
  const header = database.subarray(0, 15).toString('utf8');
  if (header !== 'SQLite format 3') {
    throw new BackupError('The backup does not contain a database.', 'CORRUPT');
  }
  const scratch = mkdtempSync(join(tmpdir(), 'puente-verify-'));
  const probe = join(scratch, 'probe.db');
  try {
    writeFileSync(probe, database);
    const db = new Database(probe, { readonly: true });
    // `users` has existed since the first release; its absence means this is not a puente backup.
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
      .get();
    db.close();
    if (!row) {
      throw new BackupError('That database was not written by puente.', 'CORRUPT');
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
