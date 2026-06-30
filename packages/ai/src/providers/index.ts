/**
 * Live provider adapters (P3-02) + a `buildLiveProviders` factory. The factory builds the
 * free-first set of registered providers for an `AIService` from explicit config — only the
 * providers you configure are included. The DB-backed key pool / provider accounts (P3-12) are a
 * separate layer; this factory takes already-resolved keys/URLs and stays pure + testable.
 */

import type { AiProvider } from '../types';
import type { HttpOptions } from './http';
import { GeminiProvider, type GeminiProviderConfig } from './gemini';
import { GroqProvider, type GroqProviderConfig } from './groq';
import { OpenRouterProvider, type OpenRouterProviderConfig } from './openrouter';
import { OllamaProvider, type OllamaProviderConfig } from './ollama';

import { JinaProvider, type JinaProviderConfig } from './jina';

export { ProviderHttpError, type FetchLike, type HttpOptions } from './http';
export { type ProviderCredential, type ResolveProviderCredential } from './credentials';
export { GeminiProvider, type GeminiProviderConfig } from './gemini';
export { GroqProvider, type GroqProviderConfig } from './groq';
export { OpenRouterProvider, type OpenRouterProviderConfig } from './openrouter';
export { OllamaProvider, type OllamaProviderConfig } from './ollama';
export { JinaProvider, type JinaProviderConfig } from './jina';

export interface LiveProvidersConfig {
  gemini?: GeminiProviderConfig;
  groq?: GroqProviderConfig;
  openrouter?: OpenRouterProviderConfig;
  ollama?: OllamaProviderConfig;
  jina?: JinaProviderConfig;
  /** Shared HTTP options merged into each provider (a provider's own value wins). */
  http?: HttpOptions;
}

/** Build the configured live providers, free-first order. Pass the result to `new AIService({ providers })`. */
export function buildLiveProviders(config: LiveProvidersConfig): AiProvider[] {
  const http = config.http ?? {};
  const providers: AiProvider[] = [];
  if (config.gemini) providers.push(new GeminiProvider({ ...http, ...config.gemini }));
  if (config.groq) providers.push(new GroqProvider({ ...http, ...config.groq }));
  if (config.openrouter) providers.push(new OpenRouterProvider({ ...http, ...config.openrouter }));
  if (config.ollama) providers.push(new OllamaProvider({ ...http, ...config.ollama }));
  if (config.jina) providers.push(new JinaProvider({ ...http, ...config.jina }));
  return providers;
}
