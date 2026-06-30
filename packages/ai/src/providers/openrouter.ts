/**
 * OpenRouter adapter — experimental free-model fallback. OpenAI-compatible chat completions at
 * `/api/v1/chat/completions`. Text generation only. `referer`/`title` populate OpenRouter's
 * optional attribution headers.
 */

import { type HttpOptions } from './http';
import { getProviderCredential, type ResolveProviderCredential } from './credentials';
import { openAiChatCompletion } from './openai-chat';
import { redactPii } from '../redact';
import type { AiProvider, CompletionRequest, CompletionResult, ProviderCapabilities } from '../types';

export interface OpenRouterProviderConfig extends HttpOptions {
  apiKey?: string;
  resolveCredential?: ResolveProviderCredential;
  /** Default `https://openrouter.ai`. */
  baseUrl?: string;
  /** Optional `HTTP-Referer` attribution header. */
  referer?: string;
  /** Optional `X-Title` attribution header. */
  title?: string;
}

export class OpenRouterProvider implements AiProvider {
  readonly name = 'openrouter' as const;
  private readonly apiKey?: string;
  private readonly resolveCredential?: ResolveProviderCredential;
  private readonly baseUrl: string;
  private readonly referer?: string;
  private readonly title?: string;
  private readonly http: HttpOptions;

  constructor(config: OpenRouterProviderConfig) {
    this.apiKey = config.apiKey;
    this.resolveCredential = config.resolveCredential;
    this.baseUrl = (config.baseUrl ?? 'https://openrouter.ai').replace(/\/+$/, '');
    this.referer = config.referer;
    this.title = config.title;
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
    const url = `${this.baseUrl}/api/v1/chat/completions`;
    const headers: Record<string, string> = { authorization: `Bearer ${credential.apiKey}` };
    if (this.referer) headers['HTTP-Referer'] = this.referer;
    if (this.title) headers['X-Title'] = this.title;

    let prompt = req.prompt;
    let system = req.system;
    if (req.privacyMode === 'redact_pii_before_ai' && credential.isFreeTier) {
      prompt = redactPii(prompt) ?? prompt;
      system = system ? redactPii(system) : undefined;
    }
    const redactedReq = { ...req, prompt, system };

    const result = await openAiChatCompletion('openrouter', url, headers, redactedReq, this.http);
    return {
      ...result,
      apiKeyId: credential.apiKeyId,
      providerAccountId: credential.providerAccountId,
      isFreeTier: credential.isFreeTier,
    };
  }
}
