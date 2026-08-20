import { Module } from '@nestjs/common';
import { EventsModule } from '../../modules/events/events.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertDispatcher } from './alert-dispatcher.service';

/** puente Pro — alerting. Licensed under the puente Commercial License; see `ee/LICENSE.md`. */
@Module({
  imports: [EventsModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertDispatcher],
  exports: [AlertsService],
})
export class AlertsModule {}
