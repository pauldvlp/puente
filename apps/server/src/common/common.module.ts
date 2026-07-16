import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { EventBus } from './event-bus.service';

@Global()
@Module({
  providers: [CryptoService, EventBus],
  exports: [CryptoService, EventBus],
})
export class CommonModule {}
