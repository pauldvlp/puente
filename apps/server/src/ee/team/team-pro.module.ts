import { Module } from '@nestjs/common';
import { TeamProController } from './team-pro.controller';

/** puente Pro — team accounts. See `ee/LICENSE.md`. */
@Module({
  controllers: [TeamProController],
})
export class TeamProModule {}
