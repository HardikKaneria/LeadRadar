/**
 * Deterministic, offline provider for tests and local/dev runs with no API keys. Real adapters
 * (Gemini, Groq, OpenRouter, Ollama) land in P3-02 against this same `AiProvider` contract.
 */

import type {
  AiProvider,
  CompletionRequest,
  CompletionResult,
  EmbedRequest,
  ProviderCapabilities,
  ProviderEmbedResult,
  ProviderName,
} from '../types';

export interface FakeProviderOptions {
  /** Name to register under (defaults to 'fake'; set to 'gemini'/'groq' to stand in for them). */
  name?: ProviderName;
  /** Custom text generator. Defaults to echoing the prompt. */
  responder?: (req: CompletionRequest) => string;
  /** Fixed embedding dimension. Default 8 (keep tests small; real routes use 1536). */
  embedDims?: number;
  /** Throw on the first N `complete` calls — to exercise fallback / circuit breaker. */
  failTimes?: number;
  /** Throw on every call. */
  alwaysFail?: boolean;
}

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export class FakeProvider implements AiProvider {
  readonly name: ProviderName;
  private remainingFailures: number;

  constructor(private readonly options: FakeProviderOptions = {}) {
    this.name = options.name ?? 'fake';
    this.remainingFailures = options.failTimes ?? 0;
  }

  capabilities(): ProviderCapabilities {
    return { json: true, embed: true, maxOutputTokens: 8192 };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (this.options.alwaysFail) throw new Error(`fake provider "${this.name}" forced failure`);
    if (this.remainingFailures > 0) {
      this.remainingFailures -= 1;
      throw new Error(`fake provider "${this.name}" transient failure`);
    }
    const text = this.options.responder ? this.options.responder(req) : `echo: ${req.prompt}`;
    return {
      text,
      model: req.model,
      inputTokens: estimateTokens(`${req.system ?? ''} ${req.prompt}`),
      outputTokens: estimateTokens(text),
    };
  }

  async embed(req: EmbedRequest): Promise<ProviderEmbedResult> {
    const dims = this.options.embedDims ?? 8;
    // Deterministic pseudo-embedding from the input chars — stable across runs.
    const vector = Array.from({ length: dims }, (_, i) => {
      let acc = i + 1;
      for (let c = 0; c < req.input.length; c += 1) acc = (acc * 31 + req.input.charCodeAt(c)) % 1000;
      return acc / 1000;
    });
    return { vector, model: req.model, inputTokens: estimateTokens(req.input) };
  }
}
