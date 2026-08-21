import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { UpdateWorkspaceSchema, type UpdateWorkspaceInput, type Workspace } from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
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

  /** Renaming is free: Community has a workspace, and naming your own things is not a feature. */
  @Patch(':id')
  rename(
    @Param('id') id: string,
    @Body(new ZodBody(UpdateWorkspaceSchema)) dto: UpdateWorkspaceInput,
  ): Workspace {
    return toWorkspaceDto(this.workspaces.patch(id, { name: dto.name }));
  }
}
