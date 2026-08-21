import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { SessionUser } from '@puente/shared';
import { ActorContext } from './actor.service';

/**
 * Opens the actor scope for the request.
 *
 * An interceptor rather than middleware because `req.user` is populated by the JWT guard, and
 * guards run after middleware — a middleware here would only ever see an anonymous request.
 */
@Injectable()
export class ActorInterceptor implements NestInterceptor {
  constructor(private readonly actor: ActorContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest<{ user?: SessionUser }>().user;
    if (!user) return next.handle();
    return this.actor.runAs(user, () => next.handle());
  }
}
