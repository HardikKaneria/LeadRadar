import type { TaskRoute } from '@radar/ai';
import type { OrganizationAiRuntimePolicy } from './ai-settings.service';
import {
  applyOrganizationProviderPolicy,
  isEligibleAiKey,
  pickEligibleAiKey,
  type AiKeyCandidate,
} from './ai-provider-pool.service';

function makeCandidate(overrides: {
  key?: Partial<AiKeyCandidate['key']>;
  account?: Partial<AiKeyCandidate['account']>;
} = {}): AiKeyCandidate {
  return {
    key: {
      id: 'key-1',
      provider_account_id: 'acct-1',
      provider: 'gemini',
      key_name: 'primary',
      encrypted_api_key: 'cipher',
      status: 'active',
      environment: 'production',
      allowed_task_types: [],
      daily_request_limit: null,
      monthly_token_limit: null,
      monthly_cost_limit: null,
      requests_used_today: 0,
      tokens_used_month: 0,
      cost_used_month: 0,
      last_used_at: null,
      last_error: null,
      cooldown_until: null,
      created_by: null,
      created_at: '2026-06-23T00:00:00.000Z',
      updated_at: '2026-06-23T00:00:00.000Z',
      revoked_at: null,
      ...(overrides.key ?? {}),
    },
    account: {
      id: 'acct-1',
      provider: 'gemini',
      account_name: 'Gemini Free',
      account_type: 'free_tier',
      billing_owner: null,
      status: 'active',
      monthly_budget: null,
      monthly_usage: 0,
      rate_limit_rpm: null,
      rate_limit_tpm: null,
      notes: null,
      created_at: '2026-06-23T00:00:00.000Z',
      updated_at: '2026-06-23T00:00:00.000Z',
      ...(overrides.account ?? {}),
    },
  };
}

function makeRoute(overrides: Partial<TaskRoute> = {}): TaskRoute {
  return {
    taskType: 'opportunity_analyzer',
    attempts: [
      { provider: 'gemini', model: 'gemini-2.5-flash' },
      { provider: 'openrouter', model: 'openai/gpt-4o-mini' },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
    ],
    ...overrides,
  };
}

function makePolicy(overrides: Partial<OrganizationAiRuntimePolicy> = {}): OrganizationAiRuntimePolicy {
  return {
    privacyMode: 'redact_pii_before_ai',
    providers: {},
    ...overrides,
  };
}

describe('isEligibleAiKey', () => {
  it('accepts active keys with no limits and no task restriction', () => {
    expect(isEligibleAiKey(makeCandidate(), 'opportunity_analyzer', Date.parse('2026-06-23T12:00:00.000Z'))).toBe(true);
  });

  it('rejects keys that are on cooldown or over quota', () => {
    expect(
      isEligibleAiKey(
        makeCandidate({
          key: {
            cooldown_until: '2026-06-23T13:00:00.000Z',
            daily_request_limit: 10,
            requests_used_today: 10,
          },
        }),
        'opportunity_analyzer',
        Date.parse('2026-06-23T12:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('re-allows cooldown keys once the cooldown has elapsed', () => {
    expect(
      isEligibleAiKey(
        makeCandidate({
          key: {
            status: 'cooldown',
            cooldown_until: '2026-06-23T11:00:00.000Z',
          },
        }),
        'opportunity_analyzer',
        Date.parse('2026-06-23T12:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('rejects task-restricted keys for other task types', () => {
    expect(
      isEligibleAiKey(
        makeCandidate({ key: { allowed_task_types: ['embedding'] } }),
        'sales_message',
        Date.parse('2026-06-23T12:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

describe('pickEligibleAiKey', () => {
  it('prefers free-tier keys and then the least recently used key', () => {
    const picked = pickEligibleAiKey(
      [
        makeCandidate({
          key: { id: 'paid', last_used_at: '2026-06-23T10:00:00.000Z' },
          account: { id: 'acct-paid', account_type: 'paid', account_name: 'Gemini Paid' },
        }),
        makeCandidate({
          key: { id: 'free-recent', last_used_at: '2026-06-23T11:00:00.000Z' },
        }),
        makeCandidate({
          key: { id: 'free-oldest', last_used_at: '2026-06-23T09:00:00.000Z' },
        }),
      ],
      'opportunity_analyzer',
      Date.parse('2026-06-23T12:00:00.000Z'),
    );

    expect(picked?.key.id).toBe('free-oldest');
  });

  it('returns null when nothing is eligible', () => {
    const picked = pickEligibleAiKey(
      [
        makeCandidate({ key: { status: 'cooldown', cooldown_until: '2026-06-23T13:00:00.000Z' } }),
        makeCandidate({ key: { status: 'revoked', revoked_at: '2026-06-23T11:00:00.000Z' } }),
      ],
      'opportunity_analyzer',
      Date.parse('2026-06-23T12:00:00.000Z'),
    );

    expect(picked).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// applyOrganizationProviderPolicy
// ────────────────────────────────────────────────────────────────────────────

describe('applyOrganizationProviderPolicy', () => {
  const baseRoutes: Parameters<typeof applyOrganizationProviderPolicy>[0] = {
    opportunity_analyzer: makeRoute({ taskType: 'opportunity_analyzer' }),
    sales_message: makeRoute({ taskType: 'sales_message' }),
  };

  it('passes routes through unchanged when policy is empty', () => {
    const result = applyOrganizationProviderPolicy(baseRoutes);
    expect(result).toEqual(baseRoutes);
  });

  it('returns all input task routes intact', () => {
    const result = applyOrganizationProviderPolicy(baseRoutes);
    expect(Object.keys(result)).toEqual(expect.arrayContaining(['opportunity_analyzer', 'sales_message']));
  });

  it('returns an object (never undefined or null)', () => {
    expect(applyOrganizationProviderPolicy({})).toBeDefined();
    expect(applyOrganizationProviderPolicy(baseRoutes)).not.toBeNull();
  });

  it('handles empty routes object without throwing', () => {
    expect(() => applyOrganizationProviderPolicy({})).not.toThrow();
  });
});

