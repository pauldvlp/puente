import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import {
  CreateWorkspaceSchema,
  type CreateWorkspaceInput,
  type Ok,
  type Workspace,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { WorkspacesService } from '../../modules/workspaces/workspaces.service';
import { toWorkspaceDto } from '../../modules/workspaces/workspace.mapper';
import { RequiresPro } from '../license/requires-pro.decorator';
import { MinRole } from '../../modules/auth/min-role.decorator';

/**
 * Running more than one Cloudflare account side by side is the Agency capability.
 *
 * Only creating and deleting live here. Listing and renaming stay in the free core: every install
 * has a workspace, and taking away the ability to see or name it would remove something Community
 * already had.
 */
@RequiresPro('workspaces')
@MinRole('owner')
@Controller('workspaces')
export class WorkspacesProController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  create(@Body(new ZodBody(CreateWorkspaceSchema)) dto: CreateWorkspaceInput): Workspace {
    return toWorkspaceDto(this.workspaces.create(dto));
  }

  @Delete(':id')
  remove(@Param('id') id: string): Ok {
    this.workspaces.remove(id);
    return { ok: true };
  }
}
