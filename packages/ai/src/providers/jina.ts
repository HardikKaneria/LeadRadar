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

export interface JinaProviderConfig extends HttpOptions {
  apiKey?: string;
  resolveCredential?: ResolveProviderCredential;
  /** Default `https://api.jina.ai/v1`. */
  baseUrl?: string;
}

interface JinaEmbedResponse {
  data?: { embedding?: number[] }[];
  usage?: { total_tokens?: number; prompt_tokens?: number };
}

export class JinaProvider implements AiProvider {
  readonly name = 'jina' as const;
  private readonly apiKey?: string;
  private readonly resolveCredential?: ResolveProviderCredential;
  private readonly baseUrl: string;
  private readonly http: HttpOptions;

  constructor(config: JinaProviderConfig) {
    this.apiKey = config.apiKey;
    this.resolveCredential = config.resolveCredential;
    this.baseUrl = (config.baseUrl ?? 'https://api.jina.ai/v1').replace(/\/+$/, '');
    this.http = { fetch: config.fetch, timeoutMs: config.timeoutMs };
  }

  capabilities(): ProviderCapabilities {
    return { json: false, embed: true, maxOutputTokens: 8192 };
  }

  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error('Jina provider does not currently support text completion in this implementation');
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

    const url = `${this.baseUrl}/embeddings`;
    const headers = { Authorization: `Bearer ${credential.apiKey}` };
    const body = {
      model: req.model,
      input: [input],
    };

    const data = (await postJson('jina', url, headers, body, this.http)) as JinaEmbedResponse;
    let vector = data.data?.[0]?.embedding;
    
    if (!vector || vector.length === 0) {
      throw new Error('jina returned no embedding');
    }

    // LeadRadar enforces 1536 dimension vectors for pgvector (ivfflat) compatibility
    // Jina natively returns up to 1024 dims. We pad it with zeros up to 1536.
    if (vector.length < 1536) {
      const padded = new Array(1536).fill(0);
      for (let i = 0; i < vector.length; i++) {
        padded[i] = vector[i] as number;
      }
      vector = padded;
    } else if (vector.length > 1536) {
      // Very unlikely, but truncate if needed
      vector = vector.slice(0, 1536);
    }

    return {
      vector,
      model: req.model,
      inputTokens: data.usage?.prompt_tokens ?? estimateTokens(req.input),
      providerAccountId: credential.providerAccountId,
      isFreeTier: credential.isFreeTier,
    };
  }
}
