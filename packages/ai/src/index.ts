/**
 * @radar/ai — provider-agnostic AI Gateway (P3-01 core).
 *
 * The domain only ever depends on `AIService` + the types here — never on a concrete provider.
 * Free-first routing, fallback, and a circuit breaker are built in; the DB-backed key pool,
 * `ai_task_routes`, and usage ledger persistence (P3-12/13/14) wire in through the constructor
 * (`routes`) and `hooks.onCall`. Concrete adapters (Gemini/Groq/OpenRouter/Ollama) land in P3-02
 * against the `AiProvider` contract — `FakeProvider` is the offline/test implementation.
 *
 * See docs/architecture/14-ai-provider-and-usage-system.md and 09-ai-workflow.md.
 */

export * from './types';
export * from './scoring';
export * from './redact';
export * from './analyzer';
export * from './planner';
export * from './researcher';
export * from './lead-hunting';
export * from './assistant';
export * from './proposal';
export { DEFAULT_TASK_ROUTES } from './routes';
export { ModelRouter, type RouterOptions, type AttemptOutcome } from './router';
export { FakeProvider, type FakeProviderOptions } from './providers/fake';
export {
  buildLiveProviders,
  type LiveProvidersConfig,
  GeminiProvider,
  type GeminiProviderConfig,
  GroqProvider,
  type GroqProviderConfig,
  OpenRouterProvider,
  type OpenRouterProviderConfig,
  OllamaProvider,
  type OllamaProviderConfig,
  ProviderHttpError,
  type ProviderCredential,
  type ResolveProviderCredential,
  type FetchLike,
  type HttpOptions,
} from './providers';
export { AIService, type AIServiceOptions } from './service';
