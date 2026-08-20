import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  CreateAlertChannelSchema,
  UpdateAlertChannelSchema,
  type AlertChannel,
  type AlertDelivery,
  type CreateAlertChannelInput,
  type Ok,
  type UpdateAlertChannelInput,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { RequiresPro } from '../license/requires-pro.decorator';
import { AlertsService } from './alerts.service';
import { buildPayload } from './alert-rules';
import { nowMs } from '../../common/time';

@RequiresPro('alerts')
@Controller('alerts/channels')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(): AlertChannel[] {
    return this.alerts.list();
  }

  @Post()
  create(@Body(new ZodBody(CreateAlertChannelSchema)) dto: CreateAlertChannelInput): AlertChannel {
    return this.alerts.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodBody(UpdateAlertChannelSchema)) dto: UpdateAlertChannelInput,
  ): AlertChannel {
    return this.alerts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Ok {
    this.alerts.remove(id);
    return { ok: true };
  }

  /**
   * Send a sample alert. Every alerting system needs this: nobody should discover their webhook
   * URL was wrong at 3am, and it is the only way to prove the whole chain works before an incident.
   */
  @Post(':id/test')
  test(@Param('id') id: string): Promise<AlertDelivery> {
    const row = this.alerts.getRow(id);
    const payload = buildPayload(
      {
        type: 'health.changed',
        subject: 'node',
        id: 'test',
        name: 'test-node',
        from: 'healthy',
        to: 'down',
        at: nowMs(),
      },
      'node.down',
    );
    return this.alerts.deliver(row, { ...payload, text: `${payload.text} — this is a test` });
  }
}
