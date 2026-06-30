import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface RequestPrincipal {
  userId: string;
  email: string;
  /** Set when the request carries an x-organization-id header for a verified membership. */
  organizationId?: string;
  roleSlug?: string;
  permissions: string[];
}

/** Injects the authenticated principal attached by SupabaseAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestPrincipal => {
    const req = ctx.switchToHttp().getRequest<Request & { principal: RequestPrincipal }>();
    return req.principal;
  },
);
