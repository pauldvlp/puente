import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  BadRequestException,
} from '@nestjs/common';
import {
  CreateNodeSchema,
  ProvisionNodeSchema,
  SshBootstrapSchema,
  UpdateNodeSchema,
  type CreateNodeInput,
  type Node,
  type ProvisionNodeInput,
  type SshBootstrapInput,
  type SshTestResult,
  type UpdateNodeInput,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { NodesService } from './nodes.service';

@Controller('nodes')
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Get()
  list(): Node[] {
    return this.nodes.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Node {
    return this.nodes.get(id);
  }

  @Post()
  create(@Body(new ZodBody(CreateNodeSchema)) dto: CreateNodeInput): Promise<Node> {
    return this.nodes.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodBody(UpdateNodeSchema)) dto: UpdateNodeInput): Node {
    return this.nodes.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.nodes.remove(id);
    return { ok: true };
  }

  @Post(':id/test')
  test(@Param('id') id: string): Promise<SshTestResult> {
    return this.nodes.test(id);
  }

  @Post(':id/bootstrap')
  bootstrap(
    @Param('id') id: string,
    @Body(new ZodBody(SshBootstrapSchema)) dto: SshBootstrapInput,
  ): Promise<SshTestResult> {
    return this.nodes.bootstrap(id, dto);
  }

  @Post(':id/provision')
  provision(
    @Param('id') id: string,
    @Body(new ZodBody(ProvisionNodeSchema)) dto: ProvisionNodeInput,
  ): Promise<Node> {
    return this.nodes.provision(id, dto);
  }

  @Post(':id/connector/:action')
  connector(@Param('id') id: string, @Param('action') action: string): Promise<Node> {
    if (action !== 'start' && action !== 'stop' && action !== 'restart') {
      throw new BadRequestException('action must be start, stop or restart');
    }
    return this.nodes.setConnector(id, action);
  }

  @Post(':id/refresh')
  refresh(@Param('id') id: string): Promise<Node> {
    return this.nodes.refreshStatus(id);
  }
}
