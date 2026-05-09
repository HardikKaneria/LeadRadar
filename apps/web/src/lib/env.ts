const fallbackSupabaseUrl = 'https://example.supabase.co'
const fallbackSupabaseAnonKey = 'missing-anon-key'

export const env = {
  supabaseAnonKey:
    import.meta.env.VITE_SUPABASE_ANON_KEY ?? fallbackSupabaseAnonKey,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? fallbackSupabaseUrl,
}

export const isSupabaseConfigured =
  env.supabaseUrl !== fallbackSupabaseUrl &&
  env.supabaseAnonKey !== fallbackSupabaseAnonKey
