import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_LABELS, ROLE_RANK, type Role, type SessionUser } from '@puente/shared';
import { IS_PUBLIC_KEY } from '../../common/public.decorator';
import { MIN_ROLE_KEY } from './min-role.decorator';

interface HttpRequest {
  method: string;
  user?: SessionUser;
}

/**
 * Role enforcement, with a default rather than an allow-list.
 *
 * A GET is open to anyone signed in; anything that changes state needs at least an operator.
 * `@MinRole('owner')` raises it for the handful of things that reconfigure the install — licensing,
 * the Cloudflare connection, teammates. A new write endpoint is therefore protected the moment it
 * exists, without anyone having to remember to annotate it.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<HttpRequest>();
    const user = req.user;
    // No user means the JWT guard already rejected this; nothing to decide.
    if (!user) return true;

    const explicit = this.reflector.getAllAndOverride<Role | undefined>(MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const required: Role = explicit ?? (req.method === 'GET' ? 'viewer' : 'operator');

    if (ROLE_RANK[user.role] >= ROLE_RANK[required]) return true;

    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      message:
        required === 'owner'
          ? 'Only an owner can do that.'
          : `Your account is ${ROLE_LABELS[user.role].toLowerCase()} — this needs ${ROLE_LABELS[required].toLowerCase()} or above.`,
      code: 'ROLE_REQUIRED',
      required,
    });
  }
}
