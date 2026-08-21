import { Module } from '@nestjs/common';
import { EventsModule } from '../../modules/events/events.module';
import { AuditController } from './audit.controller';

/** puente Pro — audit export. See `ee/LICENSE.md`. */
@Module({
  imports: [EventsModule],
  controllers: [AuditController],
})
export class AuditModule {}
