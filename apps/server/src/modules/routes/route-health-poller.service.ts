import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Keeps the health of every published route current without anybody looking at the panel.
 *
 * Nodes have had this since the beginning (`StatusPoller`); routes did not. `check()` was reachable
 * only from the controller — the heart button — so a route's badge was a photograph of the last
 * time a human clicked it, not a state. Worse, `health.changed` is emitted from inside `check()`:
 * with nothing calling it, alert channels could only ever fire while their owner was already
 * watching, which is precisely when an alert is worth nothing.
 */
@Injectable()
export class RouteHealthPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RouteHealthPoller.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  /** First pass shortly after boot: a panel that just started should not show yesterday's news. */
  private static readonly FIRST_TICK_MS = 5_000;

  constructor(
    private readonly routes: RoutesService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.schedule(RouteHealthPoller.FIRST_TICK_MS);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(ms?: number): void {
    if (this.stopped) return;
    const seconds = Math.max(this.settings.get().healthPollSeconds ?? 30, 10);
    this.timer = setTimeout(() => void this.tick(), ms ?? seconds * 1000);
  }

  private async tick(): Promise<void> {
    try {
      await this.routes.pollHealth();
    } catch (err) {
      this.logger.debug(`route health poll failed: ${String(err)}`);
    } finally {
      // Re-read the interval every time, so changing it in Settings takes effect on the next pass.
      this.schedule();
    }
  }
}
