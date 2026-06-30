import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  organizationId: string;
  userId: string;
  permissions: string[];
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Run a callback with the given tenant context bound for its async lifetime. */
export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getTenant(): TenantContext | undefined {
  return storage.getStore();
}

export function requireTenant(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error('No tenant context bound for this request/job.');
  }
  return ctx;
}
