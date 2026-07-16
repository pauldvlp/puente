import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '@puente/shared';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
