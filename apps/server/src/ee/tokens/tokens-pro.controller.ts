import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import {
  CreateApiTokenSchema,
  type CreateApiTokenInput,
  type CreatedApiToken,
  type Ok,
  type SessionUser,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { CurrentUser } from '../../common/current-user.decorator';
import { MinRole } from '../../modules/auth/min-role.decorator';
import { ApiTokenService } from '../../modules/auth/api-token.service';
import { RequiresPro } from '../license/requires-pro.decorator';

/**
 * puente Pro — issuing API tokens.
 *
 * Note what is *not* gated: tokens already issued keep authenticating without a licence. Breaking
 * a customer's CI the day their invoice lapsed is an outage, not a sales tactic — the same reason
 * an expired licence never takes a tunnel down.
 */
@RequiresPro('api')
@MinRole('owner')
@Controller('api-tokens')
export class TokensProController {
  constructor(private readonly tokens: ApiTokenService) {}

  /** The secret is in this response and nowhere else, ever again. */
  @Post()
  create(
    @Body(new ZodBody(CreateApiTokenSchema)) dto: CreateApiTokenInput,
    @CurrentUser() user: SessionUser,
  ): CreatedApiToken {
    return this.tokens.create(dto, user);
  }

  @Delete(':id')
  revoke(@Param('id') id: string): Ok {
    this.tokens.revoke(id);
    return { ok: true };
  }
}
