import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UPGRADE_URL, type ProFeature } from '@puente/shared';
import { LicenseService } from './license.service';
import { REQUIRES_PRO_KEY } from './requires-pro.decorator';

/** Refuses handlers marked with {@link RequiresPro} unless the license unlocks that feature. */
@Injectable()
export class ProGuard implements CanActivate {
  constructor(
    private readonly licenses: LicenseService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<ProFeature | undefined>(REQUIRES_PRO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;
    if (this.licenses.has(feature)) return true;

    throw new ForbiddenException({
      statusCode: 403,
      error: 'ProFeature',
      message: `This is a puente Pro feature. See ${UPGRADE_URL}`,
      code: 'PRO_REQUIRED',
      feature,
    });
  }
}
