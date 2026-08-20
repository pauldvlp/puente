import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LicenseController } from './license/license.controller';
import { LicenseService } from './license/license.service';
import { ProGuard } from './license/pro.guard';

/**
 * puente Pro. Licensed under the puente Commercial License — see `ee/LICENSE.md`.
 *
 * Global so any module can ask {@link LicenseService} what is unlocked without importing
 * ee-specific wiring, and so the AGPL side never grows an import cycle into here.
 */
@Global()
@Module({
  controllers: [LicenseController],
  providers: [LicenseService, ProGuard, { provide: APP_GUARD, useClass: ProGuard }],
  exports: [LicenseService, ProGuard],
})
export class EeModule {}
