import { Module } from '@nestjs/common';
import { NodesModule } from '../../modules/nodes/nodes.module';
import { EventsModule } from '../../modules/events/events.module';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';

/** puente Agency — fleet operations. See `ee/LICENSE.md`. */
@Module({
  imports: [NodesModule, EventsModule],
  controllers: [FleetController],
  providers: [FleetService],
})
export class FleetModule {}
