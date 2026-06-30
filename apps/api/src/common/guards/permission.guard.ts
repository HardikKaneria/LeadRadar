import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ForbiddenError } from '@radar/core';
import type { PermissionKey } from '@radar/contracts';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { RequestPrincipal } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { principal?: RequestPrincipal }>();
    const principal = req.principal;
    if (!principal) throw new ForbiddenError('No authenticated principal');

    const missing = required.filter((key) => !principal.permissions.includes(key));
    if (missing.length > 0) {
      throw new ForbiddenError('Insufficient permissions', { missing });
    }
    return true;
  }
}
