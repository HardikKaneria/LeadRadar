import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@radar/contracts';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/** Gate a route behind one or more RBAC permission keys (all required). */
export const RequirePermission = (...keys: PermissionKey[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, keys);
