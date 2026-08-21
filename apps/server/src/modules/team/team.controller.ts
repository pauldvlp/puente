import { Controller, Get } from '@nestjs/common';
import type { SessionUser, TeamMember } from '@puente/shared';
import { CurrentUser } from '../../common/current-user.decorator';
import { TeamService } from './team.service';

@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  /** Free: seeing who can sign in is not a feature. Adding people is — see ee/team. */
  @Get()
  list(@CurrentUser() user: SessionUser): TeamMember[] {
    return this.team.list(user.id);
  }
}
