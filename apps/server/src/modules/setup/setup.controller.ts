import { Controller, Get } from '@nestjs/common';
import type { SetupStatus } from '@puente/shared';
import { Public } from '../../common/public.decorator';
import { AuthService } from '../auth/auth.service';
import { SettingsService } from '../settings/settings.service';
import { DbService } from '../../db/db.service';
import { nodes } from '../../db/schema';
import { APP_VERSION } from '../../config/version';

/** Public bootstrap probe the SPA uses to route the setup wizard. */
@Controller('setup')
export class SetupController {
  constructor(
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
    private readonly dbs: DbService,
  ) {}

  @Public()
  @Get('status')
  status(): SetupStatus {
    const hasAdmin = this.auth.hasAdmin();
    const cloudflareConnected = this.settings.isCloudflareConnected();
    const hasNodes = Boolean(this.dbs.db.select().from(nodes).limit(1).get());
    return {
      hasAdmin,
      cloudflareConnected,
      hasNodes,
      ready: hasAdmin && cloudflareConnected,
      version: APP_VERSION,
    };
  }
}
