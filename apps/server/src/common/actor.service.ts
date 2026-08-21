import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SessionUser } from '@puente/shared';

/**
 * Who is making the current request, for anything that needs to record it.
 *
 * Same reasoning as the workspace scope: threading a user through every service signature to
 * stamp an activity row would touch every call site for a value that is constant within a
 * request. Background work — the health poller, the CLI — has no actor at all, and says so.
 */
@Injectable()
export class ActorContext {
  private readonly scope = new AsyncLocalStorage<SessionUser>();

  runAs<T>(user: SessionUser, fn: () => T): T {
    return this.scope.run(user, fn);
  }

  /** Null when nothing human triggered this — a poll tick, a startup task, the CLI. */
  current(): SessionUser | null {
    return this.scope.getStore() ?? null;
  }
}
