/**
 * Ollama adapter — self-hosted/local models (private deployments only). Uses the native
 * `/api/chat` and `/api/embeddings` endpoints. No API key; just a base URL.
 */

import { estimateTokens, postJson, type HttpOptions } from './http';
import type {
  AiProvider,
  CompletionRequest,
  CompletionResult,
  EmbedRequest,
  ProviderCapabilities,
  ProviderEmbedResult,
} from '../types';

export interface OllamaProviderConfig extends HttpOptions {
  /** Default `http://localhost:11434`. */
  baseUrl?: string;
}

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbedResponse {
  embedding?: number[];
}

export class OllamaProvider implements AiProvider {
  readonly name = 'ollama' as const;
  private readonly baseUrl: string;
  private readonly http: HttpOptions;

  constructor(config: OllamaProviderConfig = {}) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.http = { fetch: config.fetch, timeoutMs: config.timeoutMs };
  }

  capabilities(): ProviderCapabilities {
    return { json: true, embed: true, maxOutputTokens: 8192 };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const messages: { role: string; content: string }[] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.prompt });

    const options: Record<string, unknown> = {};
    if (req.temperature != null) options.temperature = req.temperature;
    if (req.maxTokens != null) options.num_predict = req.maxTokens;

    const data = (await postJson(
      'ollama',
      `${this.baseUrl}/api/chat`,
      {},
      { model: req.model, messages, stream: false, options },
      this.http,
    )) as OllamaChatResponse;

    const text = data.message?.content ?? '';
    if (!text) throw new Error('ollama returned no message content');

    return {
      text,
      model: req.model,
      inputTokens: data.prompt_eval_count ?? estimateTokens(`${req.system ?? ''} ${req.prompt}`),
      outputTokens: data.eval_count ?? estimateTokens(text),
    };
  }

  async embed(req: EmbedRequest): Promise<ProviderEmbedResult> {
    const data = (await postJson(
      'ollama',
      `${this.baseUrl}/api/embeddings`,
      {},
      { model: req.model, prompt: req.input },
      this.http,
    )) as OllamaEmbedResponse;

    const vector = data.embedding;
    if (!vector || vector.length === 0) throw new Error('ollama returned no embedding');

    return { vector, model: req.model, inputTokens: estimateTokens(req.input) };
  }
}
