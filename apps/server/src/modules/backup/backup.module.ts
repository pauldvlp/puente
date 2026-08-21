import { Global, Module } from '@nestjs/common';
import { BackupService } from './backup.service';

/** Global so the Pro scheduler in `ee/` can reuse it without a circular import. */
@Global()
@Module({
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupModule {}
