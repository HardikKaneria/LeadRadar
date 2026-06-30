import type { AiCallRecord } from '@radar/ai';
import type { Database } from '@radar/supabase';
import {
  AiUsageService,
  buildUsageLimitSummary,
  buildUsageTotals,
  resolveUsagePeriodWindow,
} from './ai-usage.service';
import type { AiRateLimitService } from './ai-rate-limit.service';

type AiUsageEventRow = Database['public']['Tables']['ai_usage_events']['Row'];
type CompanyUsageLimitRow = Database['public']['Tables']['company_usage_limits']['Row'];
type UsageCreditGrantRow = Database['public']['Tables']['usage_credit_grants']['Row'];

function makeUsageServiceHarness() {
  const requestPayloads: Database['public']['Tables']['ai_requests']['Insert'][] = [];
  const rateLimitEventPayloads: Database['public']['Tables']['ai_provider_rate_limit_events']['Insert'][] = [];
  const apiKeyUpdates: Database['public']['Tables']['ai_api_keys']['Update'][] = [];

  const supabase = {
    from: (table: string) => {
      if (table === 'ai_model_catalog') {
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data: {
                input_cost_per_mtok: null,
                output_cost_per_mtok: null,
                is_free_tier: true,
              },
              error: null,
            }),
        });
        return chain;
      }

      if (table === 'ai_requests') {
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          insert: (payload: Database['public']['Tables']['ai_requests']['Insert']) => {
            requestPayloads.push(payload);
            return chain;
          },
          select: () => chain,
          single: () => Promise.resolve({ data: { id: 'req-1' }, error: null }),
        });
        return chain;
      }

      if (table === 'ai_api_keys') {
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: 'key-1',
                requests_used_today: 2,
                tokens_used_month: 50,
                cost_used_month: 1.25,
              },
              error: null,
            }),
          update: (payload: Database['public']['Tables']['ai_api_keys']['Update']) => {
            apiKeyUpdates.push(payload);
            return chain;
          },
          then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
        });
        return chain;
      }

      if (table === 'ai_provider_rate_limit_events') {
        return {
          insert: (payload: Database['public']['Tables']['ai_provider_rate_limit_events']['Insert']) => {
            rateLimitEventPayloads.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  } as never;

  const rateLimits = {
    providerCooldownSeconds: jest.fn(() => 45),
  } as unknown as AiRateLimitService;

  return {
    service: new AiUsageService(supabase, rateLimits),
    requestPayloads,
    rateLimitEventPayloads,
    apiKeyUpdates,
    rateLimits,
  };
}

describe('resolveUsagePeriodWindow', () => {
  it('builds UTC month bounds for an explicit period', () => {
    expect(resolveUsagePeriodWindow('2026-02')).toEqual({
      period: '2026-02',
      start: '2026-02-01T00:00:00.000Z',
      end: '2026-03-01T00:00:00.000Z',
      resetAt: '2026-03-01T00:00:00.000Z',
    });
  });
});

describe('buildUsageTotals', () => {
  it('aggregates requests, tokens, cost, and task-specific counters', () => {
    const events: Array<
      Pick<
        AiUsageEventRow,
        'task_type' | 'total_tokens' | 'input_tokens' | 'output_tokens' | 'estimated_cost'
      >
    > = [
      {
        task_type: 'opportunity_analyzer',
        total_tokens: 120,
        input_tokens: 50,
        output_tokens: 70,
        estimated_cost: 0.12,
      },
      {
        task_type: 'embedding',
        total_tokens: 30,
        input_tokens: 30,
        output_tokens: 0,
        estimated_cost: 0,
      },
    ];

    expect(buildUsageTotals(events)).toEqual({
      requests: 2,
      tokens: 150,
      cost: 0.12,
      opportunityAnalysisCount: 1,
      proposalGenerationCount: 0,
      companyResearchCount: 0,
      embeddingCount: 1,
    });
  });
});

describe('buildUsageLimitSummary', () => {
  it('adds active credits on top of the stored company limits', () => {
    const window = resolveUsagePeriodWindow('2026-06');
    const row: CompanyUsageLimitRow = {
      id: 'limit-1',
      organization_id: 'org-1',
      period: '2026-06',
      ai_requests_limit: 100,
      request_rate_limit_rpm: null,
      ai_tokens_limit: 5_000,
      ai_cost_limit: 10,
      opportunity_analysis_limit: 20,
      proposal_generation_limit: 5,
      company_research_limit: 10,
      embedding_limit: 50,
      used_requests: 80,
      used_tokens: 4_200,
      used_cost: 8.5,
      reset_at: '2026-07-01T00:00:00.000Z',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-20T00:00:00.000Z',
    };
    const grants: UsageCreditGrantRow[] = [
      {
        id: 'grant-1',
        organization_id: 'org-1',
        granted_by: null,
        metric: 'ai_requests',
        amount: 25,
        reason: 'promo',
        expires_at: '2026-06-30T23:59:59.000Z',
        created_at: '2026-06-15T00:00:00.000Z',
      },
    ];

    const summary = buildUsageLimitSummary(
      window,
      row,
      grants,
      {
        requests: 80,
        tokens: 4_200,
        cost: 8.5,
        opportunityAnalysisCount: 12,
        proposalGenerationCount: 2,
        companyResearchCount: 3,
        embeddingCount: 9,
      },
      new Date('2026-06-20T12:00:00.000Z'),
    );

    expect(summary.requests).toMatchObject({
      limit: 100,
      credit: 25,
      effectiveLimit: 125,
      used: 80,
      remaining: 45,
      exceeded: false,
    });
    expect(summary.embedding.remaining).toBe(41);
  });
});

describe('AiUsageService.recordCall', () => {
  it('persists provider rate-limit events and cools the key after a 429', async () => {
    const harness = makeUsageServiceHarness();
    const record: AiCallRecord = {
      taskType: 'opportunity_analyzer',
      organizationId: 'org-1',
      userId: 'user-1',
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      status: 'error',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 321,
      apiKeyId: 'key-1',
      providerAccountId: 'acct-1',
      isFreeTier: true,
      isRateLimitError: true,
      providerStatusCode: 429,
      retryAfterSeconds: 12,
      error: 'groq HTTP 429: rate limited',
    };

    await harness.service.recordCall(record);

    expect(harness.requestPayloads).toHaveLength(1);
    expect(harness.requestPayloads[0]).toMatchObject({
      provider: 'groq',
      status: 'error',
      api_key_id: 'key-1',
    });
    expect(harness.rateLimitEventPayloads).toHaveLength(1);
    expect(harness.rateLimitEventPayloads[0]).toMatchObject({
      provider: 'groq',
      api_key_id: 'key-1',
      provider_account_id: 'acct-1',
      limit_type: 'rpm',
      retry_after_seconds: 12,
    });
    expect(harness.apiKeyUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ last_error: 'groq HTTP 429: rate limited' }),
        expect.objectContaining({ status: 'cooldown' }),
      ]),
    );
    expect((harness.rateLimits.providerCooldownSeconds as jest.Mock).mock.calls[0]?.[0]).toBe(12);
  });
});
