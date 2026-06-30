/**
 * Google Gemini (Generative Language API v1beta) adapter — the free-first primary. Supports both
 * completion (`:generateContent`) and embeddings (`:embedContent` @ 1536 dims, matching
 * `vector(1536)`). See docs/architecture/14-ai-provider-and-usage-system.md §14.9.
 */

import { estimateTokens, postJson, type HttpOptions } from './http';
import { getProviderCredential, type ResolveProviderCredential } from './credentials';
import { redactPii } from '../redact';
import type {
  AiProvider,
  CompletionRequest,
  CompletionResult,
  EmbedRequest,
  ProviderCapabilities,
  ProviderEmbedResult,
} from '../types';

export interface GeminiProviderConfig extends HttpOptions {
  apiKey?: string;
  resolveCredential?: ResolveProviderCredential;
  /** Default `https://generativelanguage.googleapis.com`. */
  baseUrl?: string;
  /** Embedding output dimensionality. Default 1536. */
  embedDims?: number;
}

interface GeminiGenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

interface GeminiEmbedResponse {
  embedding?: { values?: number[] };
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  private readonly apiKey?: string;
  private readonly resolveCredential?: ResolveProviderCredential;
  private readonly baseUrl: string;
  private readonly embedDims: number;
  private readonly http: HttpOptions;

  constructor(config: GeminiProviderConfig) {
    this.apiKey = config.apiKey;
    this.resolveCredential = config.resolveCredential;
    this.baseUrl = (config.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    this.embedDims = config.embedDims ?? 1536;
    this.http = { fetch: config.fetch, timeoutMs: config.timeoutMs };
  }

  capabilities(): ProviderCapabilities {
    return { json: true, embed: true, maxOutputTokens: 8192 };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const credential = await getProviderCredential(req.taskType, {
      apiKey: this.apiKey,
      resolveCredential: this.resolveCredential,
    });
    const url = `${this.baseUrl}/v1beta/models/${req.model}:generateContent?key=${credential.apiKey}`;
    const generationConfig: Record<string, unknown> = {};
    if (req.maxTokens != null) generationConfig.maxOutputTokens = req.maxTokens;
    if (req.temperature != null) generationConfig.temperature = req.temperature;

    let prompt = req.prompt;
    let system = req.system;
    if (req.privacyMode === 'redact_pii_before_ai' && credential.isFreeTier) {
      prompt = redactPii(prompt) ?? prompt;
      system = system ? redactPii(system) : undefined;
    }

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const data = (await postJson('gemini', url, {}, body, this.http)) as GeminiGenerateResponse;
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (!text) throw new Error('gemini returned no text candidate');

    return {
      text,
      model: req.model,
      inputTokens: data.usageMetadata?.promptTokenCount ?? estimateTokens(`${req.system ?? ''} ${req.prompt}`),
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? estimateTokens(text),
      apiKeyId: credential.apiKeyId,
      providerAccountId: credential.providerAccountId,
      isFreeTier: credential.isFreeTier,
    };
  }

  async embed(req: EmbedRequest): Promise<ProviderEmbedResult> {
    const credential = await getProviderCredential(req.taskType, {
      apiKey: this.apiKey,
      resolveCredential: this.resolveCredential,
    });
    let input = req.input;
    if (req.privacyMode === 'redact_pii_before_ai' && credential.isFreeTier) {
      input = redactPii(input) ?? input;
    }

    const url = `${this.baseUrl}/v1beta/models/${req.model}:embedContent?key=${credential.apiKey}`;
    const body = {
      model: `models/${req.model}`,
      content: { parts: [{ text: input }] },
      outputDimensionality: this.embedDims,
    };

    const data = (await postJson('gemini', url, {}, body, this.http)) as GeminiEmbedResponse;
    const vector = data.embedding?.values;
    if (!vector || vector.length === 0) throw new Error('gemini returned no embedding');

    // embedContent does not report token usage — estimate for the ledger.
    return {
      vector,
      model: req.model,
      inputTokens: estimateTokens(req.input),
      apiKeyId: credential.apiKeyId,
      providerAccountId: credential.providerAccountId,
      isFreeTier: credential.isFreeTier,
    };
  }
}
