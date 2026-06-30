import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type { Database, Json } from './database.types';
export type { SupabaseClient } from '@supabase/supabase-js';
export type ServiceClient = SupabaseClient<Database>;

/**
 * Service-role client — bypasses RLS. Use ONLY server-side (thin NestJS + worker) for
 * AI orchestration, jobs, and webhooks. Never expose the service key to the browser.
 */
export function createServiceClient(url: string, serviceRoleKey: string): ServiceClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * A client bound to a user's access token — RLS applies as that user. Handy when the thin
 * API wants to act on behalf of the caller instead of bypassing RLS.
 */
export function createUserClient(
  url: string,
  anonKey: string,
  accessToken: string,
): ServiceClient {
  return createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
