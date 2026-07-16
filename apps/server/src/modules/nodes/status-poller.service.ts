import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Periodically refreshes live tunnel status (Cloudflare API only — no SSH) so
 * the dashboard reflects connector health without user interaction.
 */
@Injectable()
export class StatusPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatusPoller.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly nodes: NodesService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.schedule();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(): void {
    if (this.stopped) return;
    const seconds = Math.max(this.settings.get().healthPollSeconds ?? 30, 10);
    this.timer = setTimeout(() => void this.tick(), seconds * 1000);
  }

  private async tick(): Promise<void> {
    try {
      await this.nodes.pollTunnelStatuses();
    } catch (err) {
      this.logger.debug(`poll failed: ${String(err)}`);
    } finally {
      this.schedule();
    }
  }
}
