import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import {
  UpdateBackupScheduleSchema,
  type BackupFile,
  type BackupSchedule,
  type Ok,
  type UpdateBackupScheduleInput,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { MinRole } from '../../modules/auth/min-role.decorator';
import { RequiresPro } from '../license/requires-pro.decorator';
import { BackupScheduleService } from './backup-schedule.service';

/**
 * puente Pro — backups that happen without anyone remembering.
 *
 * Taking one by hand stays free (`puente backup`). Owner-only: the passphrase set here decrypts
 * every file the schedule produces.
 */
@RequiresPro('backup')
@MinRole('owner')
@Controller('backup/schedule')
export class BackupScheduleController {
  constructor(private readonly schedule: BackupScheduleService) {}

  @Get()
  get(): BackupSchedule {
    return this.schedule.get();
  }

  @Patch()
  update(
    @Body(new ZodBody(UpdateBackupScheduleSchema)) dto: UpdateBackupScheduleInput,
  ): BackupSchedule {
    return this.schedule.update(dto);
  }

  @Get('files')
  files(): BackupFile[] {
    return this.schedule.list();
  }

  /** Nobody should discover their schedule is broken on the night it mattered. */
  @Post('run')
  run(): Promise<BackupFile> {
    return this.schedule.runNow();
  }

  @Delete('files/:name')
  remove(@Param('name') name: string): Ok {
    this.schedule.remove(name);
    return { ok: true };
  }
}
