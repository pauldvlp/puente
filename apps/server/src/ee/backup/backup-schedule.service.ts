import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NO_PASSPHRASE_SET,
  type BackupFile,
  type BackupFrequency,
  type BackupSchedule,
  type UpdateBackupScheduleInput,
} from '@puente/shared';
import { DbService } from '../../db/db.service';
import { CryptoService } from '../../common/crypto.service';
import { BackupService } from '../../modules/backup/backup.service';
import { EventsService } from '../../modules/events/events.service';
import { backupSchedule, type BackupScheduleRow } from '../../db/schema';
import { BACKUPS_DIR } from '../../config/paths';
import { nowMs, toIsoStrict } from '../../common/time';
import { filesToPrune, nextRunAfter } from './schedule';

const ROW_ID = 'current';
const SUFFIX = '.pbk';

@Injectable()
export class BackupScheduleService {
  private readonly log = new Logger('Backup');

  constructor(
    private readonly dbs: DbService,
    private readonly crypto: CryptoService,
    private readonly backups: BackupService,
    private readonly events: EventsService,
  ) {}

  private get db() {
    return this.dbs.db;
  }

  row(): BackupScheduleRow {
    const existing = this.db
      .select()
      .from(backupSchedule)
      .where(eq(backupSchedule.id, ROW_ID))
      .get();
    if (existing) return existing;
    const now = nowMs();
    const row: BackupScheduleRow = {
      id: ROW_ID,
      enabled: false,
      frequency: 'daily',
      hour: 3,
      weekday: 0,
      keep: 7,
      directory: BACKUPS_DIR,
      passphraseEnc: null,
      lastRunAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(backupSchedule).values(row).run();
    return row;
  }

  get(): BackupSchedule {
    return this.toDto(this.row());
  }

  update(dto: UpdateBackupScheduleInput): BackupSchedule {
    const current = this.row();
    const patch: Partial<BackupScheduleRow> = { updatedAt: nowMs() };
    if (dto.frequency !== undefined) patch.frequency = dto.frequency;
    if (dto.hour !== undefined) patch.hour = dto.hour;
    if (dto.weekday !== undefined) patch.weekday = dto.weekday;
    if (dto.keep !== undefined) patch.keep = dto.keep;
    if (dto.directory !== undefined) patch.directory = dto.directory;
    if (dto.passphrase !== undefined) {
      patch.passphraseEnc = dto.passphrase ? this.crypto.encrypt(dto.passphrase) : null;
    }

    if (dto.enabled === true) {
      // Turning it on without a passphrase would schedule a job that can only ever fail.
      const willHave = dto.passphrase ?? (current.passphraseEnc ? 'kept' : '');
      if (!willHave) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'NoPassphrase',
          message: 'Set a passphrase first — a backup is encrypted with it, always.',
          code: NO_PASSPHRASE_SET,
        });
      }
      patch.enabled = true;
      patch.lastError = null;
    } else if (dto.enabled === false) {
      patch.enabled = false;
    }

    this.db.update(backupSchedule).set(patch).where(eq(backupSchedule.id, ROW_ID)).run();
    return this.get();
  }

  /** Files already in the backup directory, newest first. */
  list(): BackupFile[] {
    const dir = this.row().directory;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return []; // no directory yet is not an error, it just means no backups
    }
    return names
      .filter((n) => n.endsWith(SUFFIX))
      .map((name) => {
        const stat = statSync(join(dir, name));
        return { name, bytes: stat.size, createdAt: toIsoStrict(stat.mtimeMs) };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Take one now. Used by the scheduler and by the "Back up now" button, which is the only way
   * anyone finds out their schedule works before the night it matters.
   */
  async runNow(): Promise<BackupFile> {
    const row = this.row();
    const passphrase = this.crypto.tryDecrypt(row.passphraseEnc);
    if (!passphrase) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'NoPassphrase',
        message: 'Set a passphrase first — a backup is encrypted with it, always.',
        code: NO_PASSPHRASE_SET,
      });
    }

    try {
      const sealed = await this.backups.create(passphrase);
      mkdirSync(row.directory, { recursive: true, mode: 0o700 });
      const name = `puente-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}${SUFFIX}`;
      writeFileSync(join(row.directory, name), sealed, { mode: 0o600 });

      // Prune only after a success: deleting first and failing second is how someone ends up
      // with fewer backups than they started with.
      this.prune(row);

      this.db
        .update(backupSchedule)
        .set({ lastRunAt: nowMs(), lastError: null, updatedAt: nowMs() })
        .where(eq(backupSchedule.id, ROW_ID))
        .run();
      this.events.success('backup.run', `Backup written to ${name}`);
      return { name, bytes: sealed.length, createdAt: new Date().toISOString() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.db
        .update(backupSchedule)
        .set({ lastRunAt: nowMs(), lastError: message, updatedAt: nowMs() })
        .where(eq(backupSchedule.id, ROW_ID))
        .run();
      this.events.error('backup.failed', `Scheduled backup failed: ${message}`);
      throw err;
    }
  }

  remove(name: string): void {
    // Names come from the API, so anything with a path separator is someone probing.
    if (name.includes('/') || name.includes('\\') || !name.endsWith(SUFFIX)) {
      throw new BadRequestException('That is not a backup file.');
    }
    rmSync(join(this.row().directory, name), { force: true });
  }

  private prune(row: BackupScheduleRow): void {
    const files = this.list().map((f) => ({ name: f.name, createdAt: Date.parse(f.createdAt) }));
    for (const file of filesToPrune(files, row.keep)) {
      rmSync(join(row.directory, file.name), { force: true });
      this.log.log(`Pruned old backup ${file.name}`);
    }
  }

  /** Null when disabled — there is no next run to show. */
  nextRun(row: BackupScheduleRow, from = new Date()): Date | null {
    if (!row.enabled) return null;
    return nextRunAfter(
      { frequency: row.frequency as BackupFrequency, hour: row.hour, weekday: row.weekday },
      from,
    );
  }

  private toDto(row: BackupScheduleRow): BackupSchedule {
    const next = this.nextRun(row);
    return {
      enabled: row.enabled,
      frequency: row.frequency as BackupFrequency,
      hour: row.hour,
      weekday: row.weekday,
      keep: row.keep,
      directory: row.directory,
      hasPassphrase: Boolean(row.passphraseEnc),
      lastRunAt: row.lastRunAt ? toIsoStrict(row.lastRunAt) : null,
      lastError: row.lastError,
      nextRunAt: next ? next.toISOString() : null,
    };
  }
}
