import {
  isEligibleExternalKey,
  pickEligibleExternalKey,
} from './external-provider-pool.service';
import type { ExternalProviderKeyCandidate } from './external-provider.types';

function makeCandidate(overrides: {
  key?: Partial<ExternalProviderKeyCandidate['key']>;
  account?: Partial<ExternalProviderKeyCandidate['account']>;
} = {}): ExternalProviderKeyCandidate {
  return {
    key: {
      id: 'key-1',
      provider_account_id: 'acct-1',
      provider: 'bright_data',
      key_name: 'primary',
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
      ...(overrides.key ?? {}),
    },
    account: {
      id: 'acct-1',
      organization_id: null,
      provider: 'bright_data',
      account_name: 'Bright Data Free',
      account_type: 'free_tier',
      billing_owner: null,
      status: 'active',
      plan_profile_id: null,
      allowed_organization_ids: [],
      weekly_budget: null,
      monthly_budget: null,
      total_budget: null,
      weekly_usage: 0,
      monthly_usage: 0,
      total_usage: 0,
      rate_limit_rpm: null,
      rate_limit_tpm: null,
      base_url: null,
      notes: null,
      created_by: null,
      created_at: '2026-06-29T00:00:00.000Z',
      updated_at: '2026-06-29T00:00:00.000Z',
      ...(overrides.account ?? {}),
    },
    planProfile: null,
  };
}

describe('isEligibleExternalKey', () => {
  it('accepts active keys when the org and task are allowed', () => {
    expect(
      isEligibleExternalKey(
        makeCandidate(),
        'org-1',
        'linkedin_post_lookup',
        Date.parse('2026-06-29T12:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('rejects keys that are over quota, on cooldown, or outside org allowlists', () => {
    expect(
      isEligibleExternalKey(
        makeCandidate({
          key: {
            cooldown_until: '2026-06-29T13:00:00.000Z',
            daily_request_limit: 5,
            requests_used_today: 5,
          },
          account: {
            allowed_organization_ids: ['org-2'],
          },
        }),
        'org-1',
        'linkedin_post_lookup',
        Date.parse('2026-06-29T12:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

describe('pickEligibleExternalKey', () => {
  it('prefers free-tier candidates and then the least recently used key', () => {
    const picked = pickEligibleExternalKey(
      [
        makeCandidate({
          key: { id: 'paid', last_used_at: '2026-06-29T11:00:00.000Z' },
          account: { id: 'acct-paid', account_type: 'paid', account_name: 'Bright Data Paid' },
        }),
        makeCandidate({
          key: { id: 'free-recent', last_used_at: '2026-06-29T10:00:00.000Z' },
        }),
        makeCandidate({
          key: { id: 'free-oldest', last_used_at: '2026-06-29T09:00:00.000Z' },
        }),
      ],
      'org-1',
      'linkedin_post_lookup',
      Date.parse('2026-06-29T12:00:00.000Z'),
    );

    expect(picked?.key.id).toBe('free-oldest');
  });

  it('returns null when no candidate is eligible for the requested task', () => {
    const picked = pickEligibleExternalKey(
      [makeCandidate({ key: { allowed_task_types: ['website_crawl'] } })],
      'org-1',
      'linkedin_post_lookup',
      Date.parse('2026-06-29T12:00:00.000Z'),
    );

    expect(picked).toBeNull();
  });
});
