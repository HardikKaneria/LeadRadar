/**
 * @radar/ai — core types. Provider-agnostic by design: nothing in the domain depends on a
 * concrete provider, only on AIService + these contracts. See
 * docs/architecture/14-ai-provider-and-usage-system.md.
 */

/** AI task types — mirror `ai_task_routes.task_type` (doc 14). The router keys routing on these. */
export type AiPrivacyMode = 'free_api_allowed' | 'redact_pii_before_ai' | 'paid_only' | 'byok_only' | 'disabled' | string;
export const AI_TASK_TYPES = [
  'opportunity_analyzer',
  'action_planner',
  'company_research',
  'post_research_classifier',
  'archive_classifier',
  'lead_quality_scorer',
  'sales_message',
  'follow_up_message',
  'conversation_summary',
  'proposal_generator',
  'meeting_prep',
  'next_action',
  'embedding',
  'learning_summary',
] as const;
export type AiTaskType = (typeof AI_TASK_TYPES)[number];

export type ProviderName = 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'openai' | 'anthropic' | 'jina' | 'fake';

/** Tenant + task context carried into every call (the seam for usage attribution + privacy). */
export interface AiCallContext {
  taskType: AiTaskType;
  organizationId: string;
  userId: string;
}

export interface GenerateInput {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface StructuredInput<T> extends GenerateInput {
  /** Validate/coerce the model's JSON. Throw to trigger one repair pass, then a hard error. */
  parse: (raw: unknown) => T;
  schemaName?: string;
}

export interface EmbedInput {
  input: string;
}

export interface ProviderCallMetadata {
  apiKeyId?: string;
  providerAccountId?: string;
  isFreeTier?: boolean;
}

export interface GenerateResult extends ProviderCallMetadata {
  text: string;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface EmbedResult extends ProviderCallMetadata {
  vector: number[];
  provider: ProviderName;
  model: string;
  inputTokens: number;
}

// ── Provider adapter contract (implemented per vendor in P3-02; FakeProvider here) ──

export interface ProviderCapabilities {
  json: boolean;
  embed: boolean;
  maxOutputTokens: number;
}

export interface CompletionRequest {
  taskType: AiTaskType;
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  privacyMode?: AiPrivacyMode;
}

export interface CompletionResult extends ProviderCallMetadata {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface EmbedRequest {
  taskType: AiTaskType;
  model: string;
  input: string;
  privacyMode?: AiPrivacyMode;
}

export interface ProviderEmbedResult extends ProviderCallMetadata {
  vector: number[];
  model: string;
  inputTokens: number;
}

export interface AiProvider {
  readonly name: ProviderName;
  capabilities(): ProviderCapabilities;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  embed?(req: EmbedRequest): Promise<ProviderEmbedResult>;
}

/** A single attempt in a task's free-first fallback chain. */
export interface RouteAttempt {
  provider: ProviderName;
  model: string;
}

export interface TaskRoute {
  taskType: AiTaskType;
  /** Ordered: primary → fallback → fallback_2 (free-first; see doc 14 §14.9). */
  attempts: RouteAttempt[];
  requiresJson?: boolean;
  requiresEmbedding?: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
}

/**
 * The active prompt version the gateway resolved for a call (P3-03). The resolver lives outside
 * `@radar/ai` (the API layer reads `ai_prompt_versions`); the core just applies the resolved
 * system prompt when the caller didn't supply one and stamps `promptVersionId` onto every record.
 */
export interface ResolvedPrompt {
  promptVersionId: string;
  system?: string;
  userPromptTemplate?: string;
  modelPreferences?: Record<string, unknown>;
}

/** Resolves the active prompt version for a call context (`ai_prompt_versions` lives in the API layer). */
export type PromptResolver = (ctx: AiCallContext) => Promise<ResolvedPrompt | null> | ResolvedPrompt | null;

/**
 * Fired after every provider call (success or failure) — the seam where the usage ledger
 * (`ai_usage_events`) and technical log (`ai_requests`) plug in (P3-12/P3-14). The core does
 * not write to the DB; it emits an event the wiring layer persists.
 */
export interface AiCallRecord {
  taskType: AiTaskType;
  organizationId: string;
  userId: string;
  provider: ProviderName;
  model: string;
  status: 'ok' | 'error' | 'fallback';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** The resolved `ai_prompt_versions.id` for this call (P3-03), if a prompt version was resolved. */
  aiPromptVersionId?: string;
  apiKeyId?: string;
  providerAccountId?: string;
  isFreeTier?: boolean;
  isRateLimitError?: boolean;
  providerStatusCode?: number;
  retryAfterSeconds?: number;
  error?: string;
}

export interface AiServiceHooks {
  beforeCall?: (ctx: AiCallContext) => void | Promise<void>;
  onCall?: (record: AiCallRecord) => void | Promise<void>;
}

/** Returned (thrown) when every attempt in the route fails or no provider is available. */
export class AiUnavailableError extends Error {
  constructor(
    readonly taskType: AiTaskType,
    readonly attempts: { provider: ProviderName; model: string; error: string }[],
  ) {
    super(
      `AI unavailable for task "${taskType}" after ${attempts.length} attempt(s): ` +
        attempts.map((a) => `${a.provider}/${a.model} (${a.error})`).join('; '),
    );
    this.name = 'AiUnavailableError';
  }
}

/** Thrown when structured output cannot be validated even after one repair pass. */
export class AiSchemaError extends Error {
  constructor(
    readonly schemaName: string | undefined,
    readonly detail: string,
  ) {
    super(`AI structured output failed validation${schemaName ? ` for ${schemaName}` : ''}: ${detail}`);
    this.name = 'AiSchemaError';
  }
}
