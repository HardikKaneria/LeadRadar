import { AIService } from './service';
import { FakeProvider } from './providers/fake';
import { GroqProvider } from './providers/groq';
import { AiSchemaError, AiUnavailableError, type AiCallContext, type AiCallRecord, type TaskRoute } from './types';
import type { FetchLike } from './providers/http';

const ctx: AiCallContext = { taskType: 'opportunity_analyzer', organizationId: 'org-1', userId: 'user-1' };

// A single-provider route so tests don't depend on the default free-first chain.
const fakeRoute: TaskRoute = {
  taskType: 'opportunity_analyzer',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

function failingFetch(status: number, body: unknown, headers?: Record<string, string>): FetchLike {
  return async () => ({
    ok: false,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? headers?.[name] ?? null,
    },
  });
}

describe('AIService.generate', () => {
  it('routes to a registered provider and returns text + token counts', async () => {
    const ai = new AIService({
      providers: [new FakeProvider({ responder: (req) => `answer to: ${req.prompt}` })],
      routes: { opportunity_analyzer: fakeRoute },
    });
    const result = await ai.generate(ctx, { prompt: 'why is this a good lead?' });
    expect(result.text).toBe('answer to: why is this a good lead?');
    expect(result.provider).toBe('fake');
    expect(result.model).toBe('fake-1');
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it('emits a usage record per call via hooks.onCall', async () => {
    const records: AiCallRecord[] = [];
    const ai = new AIService({
      providers: [new FakeProvider()],
      routes: { opportunity_analyzer: fakeRoute },
      hooks: {
        onCall: (r) => {
          records.push(r);
        },
      },
    });
    await ai.generate(ctx, { prompt: 'hi' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ provider: 'fake', status: 'ok', organizationId: 'org-1', userId: 'user-1' });
  });

  it('runs hooks.beforeCall before executing the provider', async () => {
    const steps: string[] = [];
    const ai = new AIService({
      providers: [
        new FakeProvider({
          responder: () => {
            steps.push('provider');
            return 'ok';
          },
        }),
      ],
      routes: { opportunity_analyzer: fakeRoute },
      hooks: {
        beforeCall: async () => {
          steps.push('before');
        },
      },
    });

    await ai.generate(ctx, { prompt: 'x' });
    expect(steps).toEqual(['before', 'provider']);
  });
});

describe('prompt resolution (P3-03)', () => {
  it('stamps the resolved prompt version onto every usage record', async () => {
    const records: AiCallRecord[] = [];
    const ai = new AIService({
      providers: [
        new FakeProvider({ name: 'gemini', alwaysFail: true }),
        new FakeProvider({ name: 'groq', responder: () => 'from groq' }),
      ],
      routes: {
        opportunity_analyzer: {
          taskType: 'opportunity_analyzer',
          attempts: [
            { provider: 'gemini', model: 'g-1' },
            { provider: 'groq', model: 'q-1' },
          ],
        },
      },
      resolvePrompt: async () => ({ promptVersionId: 'prompt-v1' }),
      hooks: { onCall: (r) => void records.push(r) },
    });

    await ai.generate(ctx, { prompt: 'x' });
    expect(records.map((r) => `${r.status}:${r.aiPromptVersionId}`)).toEqual([
      'error:prompt-v1',
      'fallback:prompt-v1',
    ]);
  });

  it('applies the resolved system prompt only when the caller did not supply one', async () => {
    const seen: Array<string | undefined> = [];
    const ai = new AIService({
      providers: [
        new FakeProvider({
          responder: (req) => {
            seen.push(req.system);
            return 'ok';
          },
        }),
      ],
      routes: { opportunity_analyzer: fakeRoute },
      resolvePrompt: () => ({ promptVersionId: 'prompt-v1', system: 'resolved system' }),
    });

    await ai.generate(ctx, { prompt: 'a' });
    await ai.generate(ctx, { prompt: 'b', system: 'caller system' });
    expect(seen).toEqual(['resolved system', 'caller system']);
  });

  it('leaves aiPromptVersionId undefined when no resolver is configured', async () => {
    const records: AiCallRecord[] = [];
    const ai = new AIService({
      providers: [new FakeProvider()],
      routes: { opportunity_analyzer: fakeRoute },
      hooks: { onCall: (r) => void records.push(r) },
    });
    await ai.generate(ctx, { prompt: 'hi' });
    expect(records[0]!.aiPromptVersionId).toBeUndefined();
  });

  it('stamps the resolved version onto embedding calls', async () => {
    const records: AiCallRecord[] = [];
    const ai = new AIService({
      providers: [new FakeProvider({ name: 'gemini', embedDims: 8 })],
      resolvePrompt: () => ({ promptVersionId: 'embed-v1' }),
      hooks: { onCall: (r) => void records.push(r) },
    });
    await ai.embed({ taskType: 'embedding', organizationId: 'org-1', userId: 'user-1' }, { input: 'hello' });
    expect(records[0]).toMatchObject({ status: 'ok', aiPromptVersionId: 'embed-v1' });
  });
});

describe('free-first fallback', () => {
  it('falls back to the next provider when the primary fails', async () => {
    const records: AiCallRecord[] = [];
    const ai = new AIService({
      providers: [
        new FakeProvider({ name: 'gemini', alwaysFail: true }),
        new FakeProvider({ name: 'groq', responder: () => 'from groq' }),
      ],
      routes: {
        opportunity_analyzer: {
          taskType: 'opportunity_analyzer',
          attempts: [
            { provider: 'gemini', model: 'g-1' },
            { provider: 'groq', model: 'q-1' },
          ],
        },
      },
      hooks: {
        onCall: (r) => {
          records.push(r);
        },
      },
    });
    const result = await ai.generate(ctx, { prompt: 'x' });
    expect(result.provider).toBe('groq');
    expect(records.map((r) => `${r.provider}:${r.status}`)).toEqual(['gemini:error', 'groq:fallback']);
  });

  it('emits provider HTTP metadata on rate-limit errors', async () => {
    const records: AiCallRecord[] = [];
    const ai = new AIService({
      providers: [
        new GroqProvider({ apiKey: 'gsk_test', fetch: failingFetch(429, 'rate limited', { 'retry-after': '12' }) }),
      ],
      routes: {
        opportunity_analyzer: {
          taskType: 'opportunity_analyzer',
          attempts: [{ provider: 'groq', model: 'llama-3.1-8b-instant' }],
        },
      },
      hooks: { onCall: (r) => void records.push(r) },
    });

    await expect(ai.generate(ctx, { prompt: 'x' })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      provider: 'groq',
      status: 'error',
      isRateLimitError: true,
      providerStatusCode: 429,
      retryAfterSeconds: 12,
    });
  });

  it('throws AiUnavailableError when every attempt fails', async () => {
    const ai = new AIService({
      providers: [new FakeProvider({ name: 'groq', alwaysFail: true })],
      routes: { opportunity_analyzer: { taskType: 'opportunity_analyzer', attempts: [{ provider: 'groq', model: 'q-1' }] } },
    });
    await expect(ai.generate(ctx, { prompt: 'x' })).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('skips attempts whose provider is not registered', async () => {
    const ai = new AIService({
      providers: [new FakeProvider({ name: 'groq', responder: () => 'ok' })],
      routes: {
        opportunity_analyzer: {
          taskType: 'opportunity_analyzer',
          attempts: [
            { provider: 'gemini', model: 'g-1' }, // not registered → skipped
            { provider: 'groq', model: 'q-1' },
          ],
        },
      },
    });
    const result = await ai.generate(ctx, { prompt: 'x' });
    expect(result.provider).toBe('groq');
  });
});

describe('circuit breaker', () => {
  it('opens after the failure threshold and skips the provider until cooldown', async () => {
    const clock = 0; // constant clock keeps the breaker open within the cooldown window
    const ai = new AIService({
      providers: [new FakeProvider({ name: 'groq', alwaysFail: true })],
      routes: { opportunity_analyzer: { taskType: 'opportunity_analyzer', attempts: [{ provider: 'groq', model: 'q-1' }] } },
      router: { failureThreshold: 2, cooldownMs: 1000 },
      now: () => clock,
    });
    // Two failures open the breaker.
    await expect(ai.generate(ctx, { prompt: 'a' })).rejects.toBeInstanceOf(AiUnavailableError);
    await expect(ai.generate(ctx, { prompt: 'b' })).rejects.toBeInstanceOf(AiUnavailableError);
    // Now the breaker is open — the next failure reason should be "circuit open", not a call.
    const err = await ai.generate(ctx, { prompt: 'c' }).catch((e) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect((err as AiUnavailableError).attempts[0]!.error).toBe('circuit open');
  });
});

describe('generateStructured', () => {
  const parse = (raw: unknown): { score: number } => {
    if (typeof raw !== 'object' || raw === null || typeof (raw as { score?: unknown }).score !== 'number') {
      throw new Error('expected { score: number }');
    }
    return raw as { score: number };
  };

  it('parses valid JSON (and tolerates ```json fences)', async () => {
    const ai = new AIService({
      providers: [new FakeProvider({ responder: () => '```json\n{"score": 92}\n```' })],
      routes: { opportunity_analyzer: fakeRoute },
    });
    const out = await ai.generateStructured(ctx, { prompt: 'score it', parse, schemaName: 'analysis' });
    expect(out.score).toBe(92);
  });

  it('runs one repair pass when the first response is invalid', async () => {
    let call = 0;
    const ai = new AIService({
      providers: [new FakeProvider({ responder: () => (call++ === 0 ? 'not json at all' : '{"score": 50}') })],
      routes: { opportunity_analyzer: fakeRoute },
    });
    const out = await ai.generateStructured(ctx, { prompt: 'score it', parse });
    expect(out.score).toBe(50);
    expect(call).toBe(2);
  });

  it('throws AiSchemaError when output is invalid even after repair', async () => {
    const ai = new AIService({
      providers: [new FakeProvider({ responder: () => 'still not json' })],
      routes: { opportunity_analyzer: fakeRoute },
    });
    await expect(ai.generateStructured(ctx, { prompt: 'x', parse, schemaName: 'analysis' })).rejects.toBeInstanceOf(AiSchemaError);
  });
});

describe('embed', () => {
  it('returns a vector via the embedding route', async () => {
    const ai = new AIService({
      providers: [new FakeProvider({ name: 'gemini', embedDims: 1536 })],
      // default embedding route → gemini/text-embedding-004
    });
    const out = await ai.embed({ taskType: 'embedding', organizationId: 'org-1', userId: 'user-1' }, { input: 'hello world' });
    expect(out.provider).toBe('gemini');
    expect(out.vector).toHaveLength(1536);
    expect(out.vector.every((n) => typeof n === 'number')).toBe(true);
  });
});
