import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenError } from '@radar/core';
import { PermissionGuard } from './permission.guard';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { RequestPrincipal } from '../decorators/current-user.decorator';

function contextWith(principal: Partial<RequestPrincipal> | undefined): ExecutionContext {
  const req = { principal };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  const reflector = new Reflector();
  const guard = new PermissionGuard(reflector);

  it('allows when no permission is required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextWith({ permissions: [] }))).toBe(true);
  });

  it('allows when the principal holds the required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['discoveries.approve']);
    expect(
      guard.canActivate(contextWith({ permissions: ['discoveries.read', 'discoveries.approve'] })),
    ).toBe(true);
  });

  it('forbids when a required permission is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['billing.manage']);
    expect(() => guard.canActivate(contextWith({ permissions: ['discoveries.read'] }))).toThrow(
      ForbiddenError,
    );
  });

  it('forbids when there is no principal', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['discoveries.read']);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(ForbiddenError);
  });

  afterEach(() => jest.restoreAllMocks());
  void REQUIRE_PERMISSION_KEY;
});
