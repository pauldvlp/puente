import { Global, Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { StreamController } from './stream.controller';

@Global()
@Module({
  providers: [EventsService],
  controllers: [EventsController, StreamController],
  exports: [EventsService],
})
export class EventsModule {}
