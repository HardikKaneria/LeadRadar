import { AIService } from '../service';
import { AiUnavailableError, type TaskRoute } from '../types';
import { GeminiProvider } from './gemini';
import { GroqProvider } from './groq';
import { OpenRouterProvider } from './openrouter';
import { OllamaProvider } from './ollama';
import { buildLiveProviders } from './index';
import { ProviderHttpError, type FetchLike } from './http';

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fake fetch that records the request and returns a canned response. */
function fakeFetch(
  responder: (req: Captured) => {
    ok?: boolean;
    status?: number;
    body: unknown;
    headers?: Record<string, string>;
  },
): { fetch: FetchLike; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetch: FetchLike = async (url, init) => {
    const captured: Captured = { url, headers: init.headers, body: JSON.parse(init.body) };
    calls.push(captured);
    const res = responder(captured);
    const text = typeof res.body === 'string' ? res.body : JSON.stringify(res.body);
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      text: async () => text,
      headers: {
        get: (name: string) => res.headers?.[name.toLowerCase()] ?? res.headers?.[name] ?? null,
      },
    };
  };
  return { fetch, calls };
}

describe('GeminiProvider', () => {
  it('completes: sends the key in the URL, system instruction, and parses text + usage', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: {
        candidates: [{ content: { parts: [{ text: 'hello back' }] } }],
        usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 3 },
      },
    }));
    const provider = new GeminiProvider({ apiKey: 'KEY123', fetch });
    const out = await provider.complete({
      taskType: 'opportunity_analyzer',
      model: 'gemini-1.5-flash',
      system: 'be terse',
      prompt: 'hi',
      temperature: 0.2,
    });

    expect(out).toEqual({ text: 'hello back', model: 'gemini-1.5-flash', inputTokens: 11, outputTokens: 3 });
    expect(calls[0]!.url).toContain('/v1beta/models/gemini-1.5-flash:generateContent?key=KEY123');
    expect(calls[0]!.body).toMatchObject({
      systemInstruction: { parts: [{ text: 'be terse' }] },
      generationConfig: { temperature: 0.2 },
    });
  });

  it('embeds: requests 1536 dims by default and returns the vector', async () => {
    const vector = Array.from({ length: 1536 }, (_, i) => i / 1536);
    const { fetch, calls } = fakeFetch(() => ({ body: { embedding: { values: vector } } }));
    const provider = new GeminiProvider({ apiKey: 'K', fetch });
    const out = await provider.embed({ taskType: 'embedding', model: 'text-embedding-004', input: 'hello world' });

    expect(out.vector).toHaveLength(1536);
    expect(out.model).toBe('text-embedding-004');
    expect(calls[0]!.body).toMatchObject({ outputDimensionality: 1536 });
  });

  it('throws when no candidate text is returned', async () => {
    const { fetch } = fakeFetch(() => ({ body: { candidates: [] } }));
    const provider = new GeminiProvider({ apiKey: 'K', fetch });
    await expect(provider.complete({ taskType: 'opportunity_analyzer', model: 'm', prompt: 'x' })).rejects.toThrow('no text candidate');
  });
});

describe('GroqProvider', () => {
  it('completes via OpenAI-compatible chat with a bearer token; estimates tokens when usage is absent', async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: { choices: [{ message: { content: 'groqd' } }] } }));
    const provider = new GroqProvider({ apiKey: 'gsk_x', fetch });
    const out = await provider.complete({
      taskType: 'opportunity_analyzer',
      model: 'llama-3.1-8b-instant',
      system: 's',
      prompt: 'two words',
    });

    expect(out.text).toBe('groqd');
    expect(out.inputTokens).toBe(3); // "s two words"
    expect(out.outputTokens).toBe(1);
    expect(calls[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(calls[0]!.headers.authorization).toBe('Bearer gsk_x');
    expect(calls[0]!.body).toMatchObject({
      messages: [
        { role: 'system', content: 's' },
        { role: 'user', content: 'two words' },
      ],
    });
  });

  it('does not advertise or implement embeddings', () => {
    const provider = new GroqProvider({ apiKey: 'k' });
    expect(provider.capabilities().embed).toBe(false);
    expect((provider as { embed?: unknown }).embed).toBeUndefined();
  });
});

describe('OpenRouterProvider', () => {
  it('sends attribution headers when configured', async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: { choices: [{ message: { content: 'ok' } }] } }));
    const provider = new OpenRouterProvider({ apiKey: 'or_k', referer: 'https://radar.app', title: 'Radar', fetch });
    await provider.complete({ taskType: 'sales_message', model: 'meta-llama/llama-3.1-8b-instruct:free', prompt: 'x' });

    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(calls[0]!.headers).toMatchObject({
      authorization: 'Bearer or_k',
      'HTTP-Referer': 'https://radar.app',
      'X-Title': 'Radar',
    });
  });
});

describe('OllamaProvider', () => {
  it('completes against /api/chat and reports native token counts', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: { message: { content: 'local answer' }, prompt_eval_count: 9, eval_count: 2 },
    }));
    const provider = new OllamaProvider({ fetch });
    const out = await provider.complete({ taskType: 'sales_message', model: 'llama3', prompt: 'hi', maxTokens: 256 });

    expect(out).toEqual({ text: 'local answer', model: 'llama3', inputTokens: 9, outputTokens: 2 });
    expect(calls[0]!.url).toBe('http://localhost:11434/api/chat');
    expect(calls[0]!.body).toMatchObject({ stream: false, options: { num_predict: 256 } });
  });

  it('embeds against /api/embeddings', async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: { embedding: [0.1, 0.2, 0.3] } }));
    const provider = new OllamaProvider({ baseUrl: 'http://host:1234/', fetch });
    const out = await provider.embed({ taskType: 'embedding', model: 'nomic-embed-text', input: 'x' });

    expect(out.vector).toEqual([0.1, 0.2, 0.3]);
    expect(calls[0]!.url).toBe('http://host:1234/api/embeddings');
  });
});

describe('error handling', () => {
  it('throws ProviderHttpError on a non-2xx response', async () => {
    const { fetch } = fakeFetch(() => ({ ok: false, status: 429, body: 'rate limited' }));
    const provider = new GroqProvider({ apiKey: 'k', fetch });
    const err = await provider.complete({ taskType: 'opportunity_analyzer', model: 'm', prompt: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect((err as ProviderHttpError).status).toBe(429);
  });

  it('parses Retry-After when the provider sends one', async () => {
    const { fetch } = fakeFetch(() => ({
      ok: false,
      status: 429,
      body: 'slow down',
      headers: { 'retry-after': '17' },
    }));
    const provider = new GroqProvider({ apiKey: 'k', fetch });
    const err = await provider.complete({ taskType: 'opportunity_analyzer', model: 'm', prompt: 'x' }).catch((e) => e);
    expect((err as ProviderHttpError).retryAfterSeconds).toBe(17);
  });

  it('a provider HTTP error triggers free-first fallback in the AIService route', async () => {
    const failing = fakeFetch(() => ({ ok: false, status: 500, body: 'boom' }));
    const ok = fakeFetch(() => ({ body: { choices: [{ message: { content: 'from groq' } }] } }));
    const route: TaskRoute = {
      taskType: 'opportunity_analyzer',
      attempts: [
        { provider: 'gemini', model: 'gemini-1.5-flash' },
        { provider: 'groq', model: 'llama-3.1-8b-instant' },
      ],
    };
    const ai = new AIService({
      providers: [
        new GeminiProvider({ apiKey: 'g', fetch: failing.fetch }),
        new GroqProvider({ apiKey: 'q', fetch: ok.fetch }),
      ],
      routes: { opportunity_analyzer: route },
    });
    const out = await ai.generate(
      { taskType: 'opportunity_analyzer', organizationId: 'org', userId: 'user' },
      { prompt: 'score it' },
    );
    expect(out.provider).toBe('groq');
    expect(out.text).toBe('from groq');
  });

  it('surfaces AiUnavailableError when every live attempt fails', async () => {
    const failing = fakeFetch(() => ({ ok: false, status: 503, body: 'down' }));
    const ai = new AIService({
      providers: [new GeminiProvider({ apiKey: 'g', fetch: failing.fetch })],
      routes: {
        opportunity_analyzer: { taskType: 'opportunity_analyzer', attempts: [{ provider: 'gemini', model: 'm' }] },
      },
    });
    await expect(
      ai.generate({ taskType: 'opportunity_analyzer', organizationId: 'o', userId: 'u' }, { prompt: 'x' }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe('buildLiveProviders', () => {
  it('includes only configured providers, in free-first order, and merges shared http', () => {
    const sharedFetch = fakeFetch(() => ({ body: {} })).fetch;
    const providers = buildLiveProviders({
      gemini: { apiKey: 'g' },
      groq: { apiKey: 'q' },
      http: { fetch: sharedFetch, timeoutMs: 5000 },
    });
    expect(providers.map((p) => p.name)).toEqual(['gemini', 'groq']);
  });

  it('returns an empty list when nothing is configured', () => {
    expect(buildLiveProviders({})).toEqual([]);
  });

  it('supports a per-call credential resolver and carries key metadata into the result', async () => {
    const { fetch } = fakeFetch(() => ({ body: { choices: [{ message: { content: 'pooled' } }] } }));
    const provider = new GroqProvider({
      fetch,
      resolveCredential: async (taskType) => ({
        apiKey: `pool-${taskType}`,
        apiKeyId: 'key-1',
        providerAccountId: 'acct-1',
        isFreeTier: true,
      }),
    });

    const out = await provider.complete({
      taskType: 'sales_message',
      model: 'llama-3.1-8b-instant',
      prompt: 'draft it',
    });

    expect(out).toMatchObject({
      text: 'pooled',
      apiKeyId: 'key-1',
      providerAccountId: 'acct-1',
      isFreeTier: true,
    });
  });
});
