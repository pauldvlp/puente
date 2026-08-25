import { Module } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { RoutesController } from './routes.controller';
import { RouteHealthPoller } from './route-health-poller.service';
import { CloudflareModule } from '../cloudflare/cloudflare.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [CloudflareModule, SettingsModule],
  providers: [RoutesService, RouteHealthPoller],
  controllers: [RoutesController],
  exports: [RoutesService],
})
export class RoutesModule {}
