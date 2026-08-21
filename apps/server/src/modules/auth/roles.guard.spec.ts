import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Role } from '@puente/shared';
import { RolesGuard } from './roles.guard';

/** Enough of a Nest context for the guard: a request, and whatever metadata the test wants. */
function contextFor(opts: { method?: string; role?: Role; minRole?: Role; isPublic?: boolean }): {
  guard: RolesGuard;
  ctx: ExecutionContext;
} {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === 'puente:min-role') return opts.minRole;
      return opts.isPublic;
    },
  } as unknown as Reflector;

  const ctx = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        method: opts.method ?? 'GET',
        user: opts.role ? { id: 'u1', username: 'u', role: opts.role } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;

  return { guard: new RolesGuard(reflector), ctx };
}

const allows = (opts: Parameters<typeof contextFor>[0]): boolean => {
  const { guard, ctx } = contextFor(opts);
  return guard.canActivate(ctx);
};

const denies = (opts: Parameters<typeof contextFor>[0]): boolean => {
  const { guard, ctx } = contextFor(opts);
  try {
    guard.canActivate(ctx);
    return false;
  } catch (err) {
    return err instanceof ForbiddenException;
  }
};

describe('RolesGuard defaults', () => {
  it('lets anyone signed in read', () => {
    expect(allows({ method: 'GET', role: 'viewer' })).toBe(true);
    expect(allows({ method: 'GET', role: 'operator' })).toBe(true);
    expect(allows({ method: 'GET', role: 'owner' })).toBe(true);
  });

  it.each(['POST', 'PATCH', 'DELETE', 'PUT'])(
    'refuses a viewer on %s without anyone having to annotate the endpoint',
    (method) => {
      // The whole point of the default: a new write endpoint is safe because it exists,
      // not because someone remembered to guard it.
      expect(denies({ method, role: 'viewer' })).toBe(true);
      expect(allows({ method, role: 'operator' })).toBe(true);
    },
  );

  it('raises the bar to owner where the endpoint says so', () => {
    expect(denies({ method: 'POST', role: 'operator', minRole: 'owner' })).toBe(true);
    expect(allows({ method: 'POST', role: 'owner', minRole: 'owner' })).toBe(true);
  });

  it('applies an explicit minimum to reads as well', () => {
    expect(denies({ method: 'GET', role: 'operator', minRole: 'owner' })).toBe(true);
  });

  it('stays out of the way on public routes and on requests the JWT guard already rejected', () => {
    expect(allows({ method: 'POST', isPublic: true })).toBe(true);
    expect(allows({ method: 'POST' })).toBe(true); // no user on the request
  });

  it('explains what the caller is missing', () => {
    const { guard, ctx } = contextFor({ method: 'DELETE', role: 'viewer' });
    try {
      guard.canActivate(ctx);
      throw new Error('should have thrown');
    } catch (err) {
      const body = (err as ForbiddenException).getResponse() as {
        message: string;
        code: string;
        required: Role;
      };
      expect(body.code).toBe('ROLE_REQUIRED');
      expect(body.required).toBe('operator');
      expect(body.message).toContain('viewer');
    }
  });
});
