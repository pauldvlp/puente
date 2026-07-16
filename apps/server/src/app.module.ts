import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { CommonModule } from './common/common.module';
import { DbModule } from './db/db.module';
import { EventsModule } from './modules/events/events.module';
import { SettingsModule } from './modules/settings/settings.module';
import { CloudflareModule } from './modules/cloudflare/cloudflare.module';
import { AuthModule } from './modules/auth/auth.module';
import { SshModule } from './modules/ssh/ssh.module';
import { CloudflaredModule } from './modules/cloudflared/cloudflared.module';
import { RoutesModule } from './modules/routes/routes.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { SetupController } from './modules/setup/setup.controller';

// The built SPA is copied next to the compiled server (dist/public) at publish.
const PUBLIC_DIR = join(__dirname, 'public');

@Module({
  imports: [
    ...(existsSync(PUBLIC_DIR)
      ? [
          ServeStaticModule.forRoot({
            rootPath: PUBLIC_DIR,
            exclude: ['/api/{*splat}'],
            serveStaticOptions: { fallthrough: true },
          }),
        ]
      : []),
    CommonModule,
    DbModule,
    EventsModule,
    SettingsModule,
    CloudflareModule,
    AuthModule,
    SshModule,
    CloudflaredModule,
    RoutesModule,
    NodesModule,
  ],
  controllers: [SetupController],
})
export class AppModule {}
