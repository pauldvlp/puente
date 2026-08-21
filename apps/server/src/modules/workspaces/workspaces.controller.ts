import { Controller, Get } from '@nestjs/common';
import type { Workspace } from '@puente/shared';
import { WorkspacesService } from './workspaces.service';
import { toWorkspaceDto } from './workspace.mapper';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /** Every workspace this install has. Creating more is a Pro capability, added separately. */
  @Get()
  list(): Workspace[] {
    return this.workspaces.list().map(toWorkspaceDto);
  }

  @Get('current')
  current(): Workspace {
    return toWorkspaceDto(this.workspaces.current());
  }
}
