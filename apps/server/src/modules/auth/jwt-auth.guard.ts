import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { API_TOKEN_PREFIX } from '@puente/shared';
import { IS_PUBLIC_KEY } from '../../common/public.decorator';
import { ApiTokenService } from './api-token.service';

/** Minimal shape we read off the incoming request (avoids an express type dep). */
interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  user?: unknown;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly tokens: ApiTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<HttpRequest>();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required.',
        code: 'UNAUTHORIZED',
      });
    }
    // An API token authenticates the same way, and carries its own role from there on.
    if (token.startsWith(API_TOKEN_PREFIX)) {
      const identity = this.tokens.authenticate(token);
      if (!identity) {
        throw new UnauthorizedException({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'That API token is not valid, or it has expired.',
          code: 'UNAUTHORIZED',
        });
      }
      req.user = identity;
      return true;
    }

    try {
      const payload = this.jwt.verify<{ sub: string; username: string; role?: string }>(token);
      // Tokens issued before roles existed carry none; they belong to the sole account, so owner.
      req.user = { id: payload.sub, username: payload.username, role: payload.role ?? 'owner' };
      return true;
    } catch {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Session expired or invalid.',
        code: 'UNAUTHORIZED',
      });
    }
  }

  /** Bearer header for XHR/fetch, or ?access_token= for EventSource (SSE). */
  private extractToken(req: HttpRequest): string | null {
    const header = req.headers.authorization;
    const auth = Array.isArray(header) ? header[0] : header;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    const q = (req.query?.access_token ?? req.query?.token) as string | undefined;
    return typeof q === 'string' ? q : null;
  }
}
