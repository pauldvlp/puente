import { Body, Controller, Post } from '@nestjs/common';
import {
  RunFleetOperationSchema,
  type FleetRun,
  type RunFleetOperationInput,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { MinRole } from '../../modules/auth/min-role.decorator';
import { RequiresPro } from '../license/requires-pro.decorator';
import { FleetService } from './fleet.service';

/**
 * puente Agency — the same connector action across every machine.
 *
 * Owner-only: this restarts other people's tunnels, one after another.
 */
@RequiresPro('fleet')
@MinRole('owner')
@Controller('fleet')
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  /**
   * Waits for the whole run and answers with the report. Progress goes out over SSE meanwhile,
   * so the panel can show which machine is being worked on without polling.
   */
  @Post('run')
  run(@Body(new ZodBody(RunFleetOperationSchema)) dto: RunFleetOperationInput): Promise<FleetRun> {
    return this.fleet.run(dto);
  }
}
