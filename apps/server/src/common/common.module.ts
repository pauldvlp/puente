import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CryptoService } from './crypto.service';
import { EventBus } from './event-bus.service';
import { ActorContext } from './actor.service';
import { ActorInterceptor } from './actor.interceptor';

@Global()
@Module({
  providers: [
    CryptoService,
    EventBus,
    ActorContext,
    { provide: APP_INTERCEPTOR, useClass: ActorInterceptor },
  ],
  exports: [CryptoService, EventBus, ActorContext],
})
export class CommonModule {}
