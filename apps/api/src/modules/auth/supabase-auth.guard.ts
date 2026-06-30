import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ForbiddenError, UnauthorizedError } from '@radar/core';
import type { ServiceClient } from '@radar/supabase';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import type { RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

/**
 * Authenticates the Supabase access token and, when an `x-organization-id` header is present,
 * verifies the membership and loads the caller's permission keys for that org.
 *
 * The thin API uses the service-role client (RLS bypassed), so authorization MUST be checked
 * here in code — it is not enforced by RLS for these endpoints.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { principal: RequestPrincipal }>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedError('Missing bearer token');

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedError('Invalid or expired token');

    const principal: RequestPrincipal = {
      userId: data.user.id,
      email: data.user.email ?? '',
      permissions: [],
    };

    const orgId = req.headers['x-organization-id'];
    if (typeof orgId === 'string' && orgId.length > 0) {
      const resolved = await this.resolveMembership(data.user.id, orgId);
      if (!resolved) throw new ForbiddenError('Not a member of this organization');
      principal.organizationId = orgId;
      principal.roleSlug = resolved.roleSlug;
      principal.permissions = resolved.permissions;
    }

    req.principal = principal;
    return true;
  }

  private async resolveMembership(
    userId: string,
    organizationId: string,
  ): Promise<{ roleSlug: string; permissions: string[] } | null> {
    const { data } = await this.supabase
      .from('memberships')
      .select('status, roles(slug, role_permissions(permissions(key)))')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .maybeSingle();

    if (!data) return null;

    // Supabase nests related rows; shape is loosely typed, so narrow defensively.
    const role = (data as { roles?: { slug?: string; role_permissions?: Array<{ permissions?: { key?: string } }> } }).roles;
    const permissions = (role?.role_permissions ?? [])
      .map((rp) => rp.permissions?.key)
      .filter((k): k is string => typeof k === 'string');

    return { roleSlug: role?.slug ?? 'member', permissions };
  }

  private extractToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header) return undefined;
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' ? value : undefined;
  }
}
