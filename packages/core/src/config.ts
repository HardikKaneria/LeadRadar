import { z } from 'zod';

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().min(1).optional());

const optionalUrlString = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  API_URL: z.string().default('http://localhost:4000'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  AI_ORG_REQUEST_RATE_LIMIT_RPM: z.coerce.number().int().min(0).default(60),
  AI_PROVIDER_RATE_LIMIT_COOLDOWN_SECONDS: z.coerce.number().int().min(1).default(90),

  // Supabase — identity, database, RLS. Service role is server-side only.
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(8),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(8),
  SUPABASE_RO_URL: optionalUrlString,
  SUPABASE_RO_SERVICE_ROLE_KEY: optionalTrimmedString,
  DISCOVERY_IMPORTS_BUCKET: z.string().trim().min(1).default('discovery-imports'),

  // Encryption for integration credentials at rest (used from Phase 3).
  ENCRYPTION_KEY: z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }, z.string().min(16).optional()),

  // AI providers (Phase 3). Blank values are treated as unset so `.env.example` stays valid.
  GEMINI_API_KEY: optionalTrimmedString,
  GROQ_API_KEY: optionalTrimmedString,
  OPENROUTER_API_KEY: optionalTrimmedString,
  OLLAMA_BASE_URL: optionalUrlString,
});

export type AppConfig = z.infer<typeof envSchema>;

/** Validate process.env once at boot. Throws with a readable message if misconfigured. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
