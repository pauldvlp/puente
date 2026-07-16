import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateRouteSchema,
  UpdateRouteSchema,
  type CreateRouteInput,
  type Route,
  type RouteCheckResult,
  type UpdateRouteInput,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { RoutesService } from './routes.service';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Get()
  list(@Query('nodeId') nodeId?: string): Route[] {
    return nodeId ? this.routes.listForNode(nodeId) : this.routes.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Route {
    return this.routes.get(id);
  }

  @Post()
  create(@Body(new ZodBody(CreateRouteSchema)) dto: CreateRouteInput): Promise<Route> {
    return this.routes.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodBody(UpdateRouteSchema)) dto: UpdateRouteInput,
  ): Promise<Route> {
    return this.routes.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    await this.routes.remove(id);
    return { ok: true };
  }

  @Post(':id/check')
  check(@Param('id') id: string): Promise<RouteCheckResult> {
    return this.routes.check(id);
  }
}
