import { ExternalProviderAdapterRegistryService } from './external-provider-adapter-registry.service';
import { ExternalProviderOrchestratorService } from './external-provider-orchestrator.service';
import {
  ExternalProviderExecutionError,
  ExternalProviderRateLimitError,
  type ExternalUsageMetrics,
} from './external-provider.types';

const zeroUsage: ExternalUsageMetrics = {
  unitType: null,
  requestCount: 0,
  recordCount: 0,
  pageCount: 0,
  searchCount: 0,
  creditCost: 0,
  usdCreditCost: 0,
  usedUnits: 0,
  estimatedCostUsd: 0,
  freeUnitsApplied: 0,
  paidUnitsApplied: 0,
  paidCostUsd: 0,
  successfulRecordCount: 0,
  failedRecordCount: 0,
  resultCount: 0,
  browserMinutes: 0,
  dataMb: 0,
  baseUnits: 0,
  multiplierTotal: 1,
  finalUnits: 0,
  billableUnits: 0,
  unitPriceUsd: 0,
  calculatedCostUsd: 0,
  providerReportedUnits: null,
  providerReportedCostUsd: null,
  costSource: null,
  costRuleId: null,
  costBreakdownJson: {},
};

function makeClaim(provider: 'bright_data' | 'apify' | 'manual', id: string) {
  return {
    credential: {
      provider,
      apiKey: `${provider}-key`,
      apiKeyId: `${id}-key`,
      providerAccountId: `${id}-account`,
      providerAccountName: `${provider} account`,
      baseUrl: null,
      isFreeTier: provider !== 'manual',
      keyName: `${provider}-primary`,
      maskedKeyPreview: '••••1234',
      planProfileId: null,
      planProfile: null,
      keyState: {
        id: `${id}-key`,
        provider_account_id: `${id}-account`,
        provider,
        key_name: `${provider}-primary`,
        encrypted_api_key: 'cipher',
        masked_key_preview: '••••1234',
        status: 'active',
        environment: 'production',
        allowed_task_types: [],
        allowed_organization_ids: [],
        priority: 100,
        daily_request_limit: null,
        weekly_request_limit: null,
        monthly_request_limit: null,
        daily_credit_limit: null,
        weekly_credit_limit: null,
        monthly_credit_limit: null,
        daily_record_limit: null,
        weekly_record_limit: null,
        monthly_record_limit: null,
        daily_cost_limit: null,
        weekly_cost_limit: null,
        monthly_cost_limit: null,
        requests_used_today: 0,
        requests_used_week: 0,
        requests_used_month: 0,
        units_used_today: 0,
        units_used_week: 0,
        units_used_month: 0,
        records_used_today: 0,
        records_used_week: 0,
        records_used_month: 0,
        credits_used_today: 0,
        credits_used_week: 0,
        credits_used_month: 0,
        cost_used_today: 0,
        cost_used_week: 0,
        cost_used_month: 0,
        reset_daily_at: null,
        reset_weekly_at: null,
        reset_monthly_at: null,
        reserved_requests_active: 0,
        reserved_records_active: 0,
        reserved_credits_active: 0,
        reserved_units_active: 0,
        reserved_cost_active: 0,
        last_used_at: null,
        last_error: null,
        cooldown_until: null,
        created_by: null,
        created_at: '2026-06-29T00:00:00.000Z',
        updated_at: '2026-06-29T00:00:00.000Z',
        revoked_at: null,
      },
    },
    reservationId: `${id}-reservation`,
    requestHash: null,
    estimate: zeroUsage,
  };
}

describe('ExternalProviderOrchestratorService', () => {
  it('falls through rate limits and provider errors before succeeding on a later provider', async () => {
    const registry = new ExternalProviderAdapterRegistryService();
    const cache = {
      find: jest.fn().mockResolvedValue(null),
      buildCacheKey: jest.fn().mockReturnValue('request-hash'),
      store: jest.fn().mockResolvedValue(undefined),
    };
    const capacity = {
      settle: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const calculator = {
      calculateEstimatedUsage: jest.fn().mockReturnValue(zeroUsage),
      calculateActualUsage: jest.fn().mockReturnValue(zeroUsage),
      applyFreeTier: jest.fn(),
    };
    const intelligence = {
      listSnapshots: jest.fn(),
      recalculateUsage: jest.fn(),
    };
    const pool = {
      claimCredential: jest
        .fn()
        .mockResolvedValueOnce(makeClaim('bright_data', 'bright'))
        .mockResolvedValueOnce(makeClaim('apify', 'apify'))
        .mockResolvedValueOnce(makeClaim('manual', 'manual')),
    };
    const routing = {
      loadRoute: jest.fn().mockResolvedValue({
        id: 'route-1',
        taskType: 'linkedin_post_lookup',
        attempts: ['bright_data', 'apify', 'manual'],
        allowManualFallback: true,
        requiresBrowser: false,
        requiresJson: true,
        timeoutMs: 45000,
        maxAttempts: 3,
      }),
    };
    const usage = {
      createCallAttempt: jest
        .fn()
        .mockResolvedValueOnce('call-1')
        .mockResolvedValueOnce('call-2')
        .mockResolvedValueOnce('call-3'),
      completeCallAttempt: jest.fn().mockResolvedValue(undefined),
      recordUsage: jest
        .fn()
        .mockResolvedValueOnce('usage-1')
        .mockResolvedValueOnce('usage-2')
        .mockResolvedValueOnce('usage-3'),
      recordRateLimit: jest.fn().mockResolvedValue(undefined),
      markKeyFailure: jest.fn().mockResolvedValue(undefined),
      markKeyUnauthorized: jest.fn().mockResolvedValue(undefined),
    };

    registry.register({
      provider: 'bright_data',
      execute: async () => {
        throw new ExternalProviderRateLimitError('Too many requests', { retryAfterSeconds: 30 });
      },
    });
    registry.register({
      provider: 'apify',
      execute: async () => {
        throw new ExternalProviderExecutionError('Actor run failed');
      },
    });
    registry.register({
      provider: 'manual',
      execute: async () => ({
        response: { ok: true },
        normalizedData: { ok: true },
        status: 'success',
      }),
    });

    const service = new ExternalProviderOrchestratorService(
      {} as any,
      registry,
      cache as any,
      capacity as any,
      calculator as any,
      intelligence as any,
      pool as any,
      routing as any,
      usage as any,
    );

    const result = await service.execute({
      organizationId: 'org-1',
      taskType: 'linkedin_post_lookup',
      request: { postUrl: 'https://linkedin.com/post/1' },
      rawPostId: 'raw-1',
      postResearchJobId: 'research-1',
      jobRunId: 'job-1',
    });

    expect(result).toMatchObject({
      kind: 'success',
      provider: 'manual',
      routeId: 'route-1',
      callId: 'call-3',
      response: { ok: true },
      status: 'success',
    });
    expect(usage.recordRateLimit).toHaveBeenCalledTimes(1);
    expect(usage.markKeyFailure).toHaveBeenCalledWith('apify-key', 'Actor run failed');
    expect(capacity.release).toHaveBeenCalledWith('bright-reservation');
    expect(capacity.release).toHaveBeenCalledWith('apify-reservation');
    expect(capacity.settle).toHaveBeenCalledWith('manual-reservation', 'usage-3', 'success', expect.any(Object));
  });

  it('returns manual fallback when no provider succeeds and manual fallback is allowed', async () => {
    const registry = new ExternalProviderAdapterRegistryService();
    const service = new ExternalProviderOrchestratorService(
      {} as any,
      registry,
      { find: jest.fn().mockResolvedValue(null), buildCacheKey: jest.fn(), store: jest.fn() } as any,
      { settle: jest.fn(), release: jest.fn() } as any,
      { calculateEstimatedUsage: jest.fn(), calculateActualUsage: jest.fn(), applyFreeTier: jest.fn() } as any,
      { listSnapshots: jest.fn(), recalculateUsage: jest.fn() } as any,
      { claimCredential: jest.fn().mockResolvedValue(null) } as any,
      {
        loadRoute: jest.fn().mockResolvedValue({
          id: 'route-1',
          taskType: 'website_discovery',
          attempts: ['tavily', 'manual'],
          allowManualFallback: true,
          requiresBrowser: false,
          requiresJson: true,
          maxAttempts: 2,
        }),
      } as any,
      {
        createCallAttempt: jest.fn(),
        completeCallAttempt: jest.fn(),
        recordUsage: jest.fn(),
        recordRateLimit: jest.fn(),
        markKeyFailure: jest.fn(),
        markKeyUnauthorized: jest.fn(),
      } as any,
    );

    const result = await service.execute({
      organizationId: 'org-1',
      taskType: 'website_discovery',
      request: { query: 'acme official site' },
    });

    expect(result).toEqual({
      kind: 'manual_fallback',
      routeId: 'route-1',
      reason: 'No eligible manual credential available',
      attemptedProviders: ['tavily', 'manual'],
    });
  });
});
