import { Module } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';
import { StatusPoller } from './status-poller.service';
import { SshModule } from '../ssh/ssh.module';
import { CloudflaredModule } from '../cloudflared/cloudflared.module';
import { CloudflareModule } from '../cloudflare/cloudflare.module';
import { SettingsModule } from '../settings/settings.module';
import { RoutesModule } from '../routes/routes.module';

@Module({
  imports: [SshModule, CloudflaredModule, CloudflareModule, SettingsModule, RoutesModule],
  providers: [NodesService, StatusPoller],
  controllers: [NodesController],
  exports: [NodesService],
})
export class NodesModule {}
