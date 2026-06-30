/**
 * Groq adapter — the fast free-tier fallback. OpenAI-compatible chat completions at
 * `/openai/v1/chat/completions`. Text generation only (no embeddings).
 */

import { type HttpOptions } from './http';
import { getProviderCredential, type ResolveProviderCredential } from './credentials';
import { openAiChatCompletion } from './openai-chat';
import { redactPii } from '../redact';
import type { AiProvider, CompletionRequest, CompletionResult, ProviderCapabilities } from '../types';

export interface GroqProviderConfig extends HttpOptions {
  apiKey?: string;
  resolveCredential?: ResolveProviderCredential;
  /** Default `https://api.groq.com`. */
  baseUrl?: string;
}

export class GroqProvider implements AiProvider {
  readonly name = 'groq' as const;
  private readonly apiKey?: string;
  private readonly resolveCredential?: ResolveProviderCredential;
  private readonly baseUrl: string;
  private readonly http: HttpOptions;

  constructor(config: GroqProviderConfig) {
    this.apiKey = config.apiKey;
    this.resolveCredential = config.resolveCredential;
    this.baseUrl = (config.baseUrl ?? 'https://api.groq.com').replace(/\/+$/, '');
    this.http = { fetch: config.fetch, timeoutMs: config.timeoutMs };
  }

  capabilities(): ProviderCapabilities {
    return { json: true, embed: false, maxOutputTokens: 8192 };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const credential = await getProviderCredential(req.taskType, {
      apiKey: this.apiKey,
      resolveCredential: this.resolveCredential,
    });
    const url = `${this.baseUrl}/openai/v1/chat/completions`;
    let prompt = req.prompt;
    let system = req.system;
    if (req.privacyMode === 'redact_pii_before_ai' && credential.isFreeTier) {
      prompt = redactPii(prompt) ?? prompt;
      system = system ? redactPii(system) : undefined;
    }
    const redactedReq = { ...req, prompt, system };

    const result = await openAiChatCompletion(
      'groq',
      url,
      { authorization: `Bearer ${credential.apiKey}` },
      redactedReq,
      this.http,
    );
    return {
      ...result,
      apiKeyId: credential.apiKeyId,
      providerAccountId: credential.providerAccountId,
      isFreeTier: credential.isFreeTier,
    };
  }
}
