import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LicenseService } from '../license/license.service';
import { BackupScheduleService } from './backup-schedule.service';

/** How often to ask "is it time yet". A minute is fine for something that runs once a day. */
const TICK_MS = 60_000;

/**
 * Runs the scheduled backup.
 *
 * Polls the clock rather than arming one long timer: a laptop that sleeps, a container that is
 * paused, a machine whose clock jumps — all of them break a timer set eleven hours in advance,
 * and none of them break "is now past the time we were due?".
 */
@Injectable()
export class BackupRunner implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Backup');
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running = false;

  constructor(
    private readonly schedule: BackupScheduleService,
    private readonly licenses: LicenseService,
  ) {}

  onModuleInit(): void {
    this.arm();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private arm(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), TICK_MS);
    // Never hold the process open for this: a backup is not a reason to refuse to shut down.
    this.timer.unref?.();
  }

  async tick(now = new Date()): Promise<void> {
    try {
      if (this.running) return;
      if (!this.licenses.has('backup')) return;

      const row = this.schedule.row();
      if (!row.enabled) return;

      // Due when the run that should have happened after the last one is now in the past.
      const since = row.lastRunAt ? new Date(row.lastRunAt) : new Date(row.createdAt);
      const due = this.schedule.nextRun(row, since);
      if (!due || due > now) return;

      this.running = true;
      this.log.log('Scheduled backup starting.');
      await this.schedule.runNow();
    } catch (err) {
      // runNow already recorded the failure; this is only so a throw cannot kill the loop.
      this.log.warn(`Scheduled backup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
      this.arm();
    }
  }
}
