import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  LoginSchema,
  RegisterAdminSchema,
  type AuthToken,
  type LoginInput,
  type RegisterAdminInput,
  type SessionUser,
} from '@puente/shared';
import { ZodBody } from '../../common/zod-validation.pipe';
import { Public } from '../../common/public.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** First-run only: create the single administrator account. */
  @Public()
  @Post('register')
  register(
    @Body(new ZodBody(RegisterAdminSchema)) dto: RegisterAdminInput,
  ): Promise<AuthToken> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body(new ZodBody(LoginSchema)) dto: LoginInput): Promise<AuthToken> {
    return this.auth.login(dto);
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }
}
