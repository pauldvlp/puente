import { Global, Module } from '@nestjs/common';
import { TeamService } from './team.service';
import { TeamController } from './team.controller';

/** Global so the Pro controller in `ee/` can reuse the service without a circular import. */
@Global()
@Module({
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
