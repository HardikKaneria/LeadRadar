
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

if ((!url || !anonKey) && typeof window !== 'undefined') {
  // Surfaced in the browser console during local setup if env is missing.
  console.warn('Supabase env not set: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

// Placeholders keep the production build from throwing when env is absent at build time
// (e.g. CI). Real values are inlined from VITE_* at the actual deploy build.
const PLACEHOLDER_URL = 'http://localhost:54321';
const PLACEHOLDER_KEY = 'public-anon-placeholder';

/** Browser Supabase client (anon key, RLS-enforced). Never use the service-role key here. */
export const supabase: SupabaseClient = createClient(url || PLACEHOLDER_URL, anonKey || PLACEHOLDER_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
