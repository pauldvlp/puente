import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateSettingsSchema, type AppSettings, type UpdateSettingsInput } from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { CloudflareService } from './cloudflare.service';
import { SettingsService } from '../settings/settings.service';
import { DATA_DIR } from '../../config/paths';

@Controller('settings')
export class AppSettingsController {
  constructor(
    private readonly cloudflare: CloudflareService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  get(): AppSettings {
    const row = this.settings.get();
    return {
      cloudflare: this.cloudflare.getConnection(),
      dataDir: DATA_DIR,
      defaultZoneId: row.defaultZoneId,
      healthPollSeconds: row.healthPollSeconds,
    };
  }

  @Patch()
  update(@Body(new ZodBody(UpdateSettingsSchema)) dto: UpdateSettingsInput): AppSettings {
    this.settings.update(dto);
    return this.get();
  }
}
