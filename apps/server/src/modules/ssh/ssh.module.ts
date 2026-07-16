import { Module } from '@nestjs/common';
import { SshService } from './ssh.service';
import { SshController } from './ssh.controller';

@Module({
  providers: [SshService],
  controllers: [SshController],
  exports: [SshService],
})
export class SshModule {}
