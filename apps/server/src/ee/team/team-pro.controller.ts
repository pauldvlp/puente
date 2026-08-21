import { BadRequestException, Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import {
  CreateTeamMemberSchema,
  SEATS_EXHAUSTED,
  UpdateTeamMemberSchema,
  type CreateTeamMemberInput,
  type Ok,
  type SessionUser,
  type TeamMember,
  type UpdateTeamMemberInput,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { CurrentUser } from '../../common/current-user.decorator';
import { TeamService } from '../../modules/team/team.service';
import { MinRole } from '../../modules/auth/min-role.decorator';
import { RequiresPro } from '../license/requires-pro.decorator';
import { LicenseService } from '../license/license.service';

/**
 * Teammates. The second account is what Pro sells; the first one every install already has.
 *
 * Owner-only on top of the licence check — handing out logins to a panel that holds Cloudflare
 * tokens and SSH credentials is not day-to-day work.
 */
@RequiresPro('team')
@MinRole('owner')
@Controller('team')
export class TeamProController {
  constructor(
    private readonly team: TeamService,
    private readonly licenses: LicenseService,
  ) {}

  @Post()
  create(
    @Body(new ZodBody(CreateTeamMemberSchema)) dto: CreateTeamMemberInput,
    @CurrentUser() user: SessionUser,
  ): TeamMember {
    const seats = this.licenses.seats;
    // Seats count everybody who can sign in, the owner included — that is how the plans are sold.
    if (seats !== null && this.team.count() >= seats) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'SeatsExhausted',
        message: `Your licence covers ${seats} seat${seats === 1 ? '' : 's'}, all in use. Remove someone, or move up a plan.`,
        code: SEATS_EXHAUSTED,
        seats,
      });
    }
    return this.team.create(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodBody(UpdateTeamMemberSchema)) dto: UpdateTeamMemberInput,
    @CurrentUser() user: SessionUser,
  ): TeamMember {
    return this.team.update(id, dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: SessionUser): Ok {
    this.team.remove(id, user.id);
    return { ok: true };
  }
}
