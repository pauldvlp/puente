import { Body, Controller, Get, Patch, Post, Query, Req, Res } from '@nestjs/common';
import {
  SsoExchangeSchema,
  UpdateSsoConfigSchema,
  type AuthToken,
  type SsoConfig,
  type SsoExchangeInput,
  type SsoStatus,
  type UpdateSsoConfigInput,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { Public } from '../../common/public.decorator';
import { MinRole } from '../../modules/auth/min-role.decorator';
import { RequiresPro } from '../license/requires-pro.decorator';
import { SsoService } from './sso.service';
import { redirectUriFor, type OriginHeaders } from './redirect-uri';

/** The only bit of the response we use. Declared here rather than pulling in express's types,
 *  the same way the JWT guard declares the request shape it reads. */
interface Redirectable {
  redirect(url: string): void;
}

/**
 * Single sign-on.
 *
 * The three endpoints a browser walks through are public by necessity — nobody is signed in yet.
 * Only *configuring* SSO is gated on the licence: an identity provider that is already set up
 * keeps working, because locking a company out of its own panel over an invoice is an outage.
 */
@Controller('sso')
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  /** All the login screen learns: whether to show the button, and what to call it. */
  @Public()
  @Get('status')
  status(): SsoStatus {
    return this.sso.status();
  }

  @Public()
  @Get('start')
  async start(@Req() req: OriginHeaders, @Res() res: Redirectable): Promise<void> {
    const url = await this.sso.authorizationUrl(redirectUriFor(req));
    res.redirect(url);
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() res: Redirectable,
  ): Promise<void> {
    if (error) {
      res.redirect(`/login?sso_error=${encodeURIComponent(error)}`);
      return;
    }
    try {
      const handoff = await this.sso.callback(code, state);
      // A one-time code, not the session token: URLs end up in histories and proxy logs.
      res.redirect(`/login?sso=${encodeURIComponent(handoff)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed.';
      res.redirect(`/login?sso_error=${encodeURIComponent(message)}`);
    }
  }

  @Public()
  @Post('exchange')
  exchange(@Body(new ZodBody(SsoExchangeSchema)) dto: SsoExchangeInput): AuthToken {
    return this.sso.redeem(dto.code);
  }

  @RequiresPro('sso')
  @MinRole('owner')
  @Get('config')
  config(@Req() req: OriginHeaders): SsoConfig {
    return this.sso.config(redirectUriFor(req));
  }

  @RequiresPro('sso')
  @MinRole('owner')
  @Patch('config')
  update(
    @Body(new ZodBody(UpdateSsoConfigSchema)) dto: UpdateSsoConfigInput,
    @Req() req: OriginHeaders,
  ): SsoConfig {
    return this.sso.update(dto, redirectUriFor(req));
  }
}
