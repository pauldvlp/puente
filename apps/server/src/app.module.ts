import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { CommonModule } from './common/common.module';
import { DbModule } from './db/db.module';
import { EventsModule } from './modules/events/events.module';
import { SettingsModule } from './modules/settings/settings.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { TeamModule } from './modules/team/team.module';
import { WorkspaceScopeMiddleware } from './modules/workspaces/workspace-scope.middleware';
import { CloudflareModule } from './modules/cloudflare/cloudflare.module';
import { AuthModule } from './modules/auth/auth.module';
import { SshModule } from './modules/ssh/ssh.module';
import { CloudflaredModule } from './modules/cloudflared/cloudflared.module';
import { RoutesModule } from './modules/routes/routes.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { SetupController } from './modules/setup/setup.controller';
import { EeModule } from './ee/ee.module';

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
    WorkspacesModule,
    EventsModule,
    SettingsModule,
    CloudflareModule,
    AuthModule,
    TeamModule,
    EeModule,
    SshModule,
    CloudflaredModule,
    RoutesModule,
    NodesModule,
  ],
  controllers: [SetupController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Everything under /api runs inside a workspace scope, including requests that never
    // mention one — they get the default.
    consumer.apply(WorkspaceScopeMiddleware).forRoutes('*');
  }
}
