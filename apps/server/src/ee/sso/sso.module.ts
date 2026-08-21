import { Module } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { EventsModule } from '../../modules/events/events.module';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';

/** puente Enterprise — SSO. See `ee/LICENSE.md`. */
@Module({
  imports: [AuthModule, EventsModule],
  controllers: [SsoController],
  providers: [SsoService],
})
export class SsoModule {}
