import { Module } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { TokensProController } from './tokens-pro.controller';

/**
 * puente Pro — API tokens. See `ee/LICENSE.md`.
 *
 * Imports AuthModule for the token service: the service itself is free core, because the JWT
 * guard has to understand tokens whether or not a licence is present. Only minting is Pro.
 */
@Module({
  imports: [AuthModule],
  controllers: [TokensProController],
})
export class TokensProModule {}
