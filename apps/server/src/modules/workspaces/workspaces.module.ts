import { Global, Module } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspaceScopeMiddleware } from './workspace-scope.middleware';

/** Global: almost everything that touches Cloudflare needs to know which account it is on. */
@Global()
@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceScopeMiddleware],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
