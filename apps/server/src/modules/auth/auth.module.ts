import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { getOrCreateJwtSecret } from '../../config/secrets';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getOrCreateJwtSecret(),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  providers: [AuthService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
