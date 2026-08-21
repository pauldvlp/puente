import { Module } from '@nestjs/common';
import { WorkspacesProController } from './workspaces-pro.controller';

/** puente Pro — client workspaces. See `ee/LICENSE.md`. */
@Module({
  controllers: [WorkspacesProController],
})
export class WorkspacesProModule {}
