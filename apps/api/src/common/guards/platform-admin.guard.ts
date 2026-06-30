import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ForbiddenError, UnauthorizedError } from '@radar/core';
import type { ServiceClient } from '@radar/supabase';
import type { RequestPrincipal } from '../decorators/current-user.decorator';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { principal?: RequestPrincipal }>();
    const principal = req.principal;
    if (!principal) throw new UnauthorizedError('Not authenticated');

    const { data, error } = await this.supabase
      .from('platform_admins')
      .select('id')
      .eq('user_id', principal.userId)
      .maybeSingle();

    if (error || !data) {
      throw new ForbiddenError('You are not a platform admin');
    }

    return true;
  }
}
