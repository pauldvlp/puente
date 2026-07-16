import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { CloudflareService } from './cloudflare.service';
import { CloudflareController } from './cloudflare.controller';
import { AppSettingsController } from './app-settings.controller';

@Module({
  imports: [SettingsModule],
  providers: [CloudflareService],
  controllers: [CloudflareController, AppSettingsController],
  exports: [CloudflareService],
})
export class CloudflareModule {}
