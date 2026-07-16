import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../../common/public.decorator';

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
    try {
      const payload = this.jwt.verify<{ sub: string; username: string }>(token);
      req.user = { id: payload.sub, username: payload.username };
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
