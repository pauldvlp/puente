import { Module } from '@nestjs/common';
import { CloudflaredService } from './cloudflared.service';

@Module({
  providers: [CloudflaredService],
  exports: [CloudflaredService],
})
export class CloudflaredModule {}
