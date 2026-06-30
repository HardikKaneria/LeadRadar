import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Injects the raw Supabase access token (Bearer) from the request Authorization header. */
export const AccessToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const [scheme, value] = header?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !value) {
      throw new UnauthorizedException('Missing bearer token');
    }
    return value;
  },
);
