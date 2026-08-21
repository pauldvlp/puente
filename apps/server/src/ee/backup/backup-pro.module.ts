import { Module } from '@nestjs/common';
import { EventsModule } from '../../modules/events/events.module';
import { BackupScheduleController } from './backup-schedule.controller';
import { BackupScheduleService } from './backup-schedule.service';
import { BackupRunner } from './backup-runner.service';

/** puente Pro — scheduled backups. See `ee/LICENSE.md`. */
@Module({
  imports: [EventsModule],
  controllers: [BackupScheduleController],
  providers: [BackupScheduleService, BackupRunner],
  exports: [BackupScheduleService],
})
export class BackupProModule {}
