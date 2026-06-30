import { Inject, Injectable } from '@nestjs/common';
import { decryptSecret, type AppConfig } from '@radar/core';
import type { Json, ServiceClient } from '@radar/supabase';
import { APP_CONFIG } from '../../config/app-config.module';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { ExternalProviderCapacityService } from './external-provider-capacity.service';
import { ExternalProviderRateLimitService } from './external-provider-rate-limit.service';
import {
  EXTERNAL_PROVIDER_ACCOUNT_PRIORITY,
  type ExternalApiKeyRow,
  type ExternalProvider,
  type ExternalProviderCredentialClaim,
  type ExternalProviderAccountRow,
  type ExternalProviderCredential,
  type ExternalProviderKeyCandidate,
  type ExternalProviderPlanProfileRow,
  type ExternalProviderTaskType,
  type ExternalUsageMetrics,
} from './external-provider.types';

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

function isOrganizationAllowed(
  organizationId: string,
  ownerOrganizationId: string | null,
  allowedOrganizationIds: string[],
): boolean {
  if (ownerOrganizationId && ownerOrganizationId !== organizationId) return false;
  if (allowedOrganizationIds.length > 0 && !allowedOrganizationIds.includes(organizationId)) {
    return false;
  }
  return true;
}

function toJson(value: Record<string, unknown> | undefined): Json | undefined {
  if (!value) return undefined;
  return JSON.parse(JSON.stringify(value)) as Json;
}

export function isEligibleExternalKey(
  candidate: ExternalProviderKeyCandidate,
  organizationId: string,
  taskType: ExternalProviderTaskType,
  now = Date.now(),
): boolean {
  if (candidate.account.status === 'disabled' || candidate.account.status === 'expired' || candidate.account.status === 'suspended') {
    return false;
  }
  if (candidate.key.revoked_at) return false;
  if (candidate.key.status !== 'active' && candidate.key.status !== 'cooldown') return false;

  if (
    !isOrganizationAllowed(
      organizationId,
      candidate.account.organization_id,
      candidate.account.allowed_organization_ids ?? [],
    )
  ) {
    return false;
  }

  if (
    !isOrganizationAllowed(
      organizationId,
      null,
      candidate.key.allowed_organization_ids ?? [],
    )
  ) {
    return false;
  }

  const cooldownUntil = parseTimestamp(candidate.key.cooldown_until);
  if (candidate.key.status === 'cooldown' && cooldownUntil == null) return false;
  if (cooldownUntil != null && cooldownUntil > now) return false;

  const allowedTaskTypes = candidate.key.allowed_task_types ?? [];
  if (allowedTaskTypes.length > 0 && !allowedTaskTypes.includes(taskType)) return false;

  if (
    candidate.key.daily_request_limit != null &&
    candidate.key.requests_used_today + candidate.key.reserved_requests_active >= candidate.key.daily_request_limit
  ) {
    return false;
  }
  if (
    candidate.key.weekly_request_limit != null &&
    candidate.key.requests_used_week + candidate.key.reserved_requests_active >= candidate.key.weekly_request_limit
  ) {
    return false;
  }
  if (
    candidate.key.monthly_request_limit != null &&
    candidate.key.requests_used_month + candidate.key.reserved_requests_active >= candidate.key.monthly_request_limit
  ) {
    return false;
  }
  if (
    candidate.key.daily_record_limit != null &&
    candidate.key.records_used_today + candidate.key.reserved_records_active >= candidate.key.daily_record_limit
  ) {
    return false;
  }
  if (
    candidate.key.weekly_record_limit != null &&
    candidate.key.records_used_week + candidate.key.reserved_records_active >= candidate.key.weekly_record_limit
  ) {
    return false;
  }
  if (
    candidate.key.monthly_record_limit != null &&
    candidate.key.records_used_month + candidate.key.reserved_records_active >= candidate.key.monthly_record_limit
  ) {
    return false;
  }
  if (
    candidate.key.daily_credit_limit != null &&
    candidate.key.credits_used_today + candidate.key.reserved_credits_active >= candidate.key.daily_credit_limit
  ) {
    return false;
  }
  if (
    candidate.key.weekly_credit_limit != null &&
    candidate.key.credits_used_week + candidate.key.reserved_credits_active >= candidate.key.weekly_credit_limit
  ) {
    return false;
  }
  if (
    candidate.key.monthly_credit_limit != null &&
    candidate.key.credits_used_month + candidate.key.reserved_credits_active >= candidate.key.monthly_credit_limit
  ) {
    return false;
  }
  if (
    candidate.key.daily_cost_limit != null &&
    candidate.key.cost_used_today + candidate.key.reserved_cost_active >= candidate.key.daily_cost_limit
  ) {
    return false;
  }
  if (
    candidate.key.weekly_cost_limit != null &&
    candidate.key.cost_used_week + candidate.key.reserved_cost_active >= candidate.key.weekly_cost_limit
  ) {
    return false;
  }
  if (
    candidate.key.monthly_cost_limit != null &&
    candidate.key.cost_used_month + candidate.key.reserved_cost_active >= candidate.key.monthly_cost_limit
  ) {
    return false;
  }
  if (
    candidate.account.monthly_budget != null &&
    candidate.account.monthly_usage >= candidate.account.monthly_budget
  ) {
    return false;
  }
  if (
    candidate.account.weekly_budget != null &&
    candidate.account.weekly_usage >= candidate.account.weekly_budget
  ) {
    return false;
  }
  if (
    candidate.account.total_budget != null &&
    candidate.account.total_usage >= candidate.account.total_budget
  ) {
    return false;
  }

  return true;
}

function compareExternalKeyCandidates(
  a: ExternalProviderKeyCandidate,
  b: ExternalProviderKeyCandidate,
): number {
  const accountPriorityDiff =
    (EXTERNAL_PROVIDER_ACCOUNT_PRIORITY[a.account.account_type] ?? Number.MAX_SAFE_INTEGER) -
    (EXTERNAL_PROVIDER_ACCOUNT_PRIORITY[b.account.account_type] ?? Number.MAX_SAFE_INTEGER);
  if (accountPriorityDiff !== 0) return accountPriorityDiff;

  const aLastUsed = parseTimestamp(a.key.last_used_at);
  const bLastUsed = parseTimestamp(b.key.last_used_at);
  if (aLastUsed == null && bLastUsed != null) return -1;
  if (aLastUsed != null && bLastUsed == null) return 1;
  if (aLastUsed != null && bLastUsed != null && aLastUsed !== bLastUsed) return aLastUsed - bLastUsed;

  return a.key.created_at.localeCompare(b.key.created_at);
}

export function orderedEligibleExternalKeys(
  candidates: ExternalProviderKeyCandidate[],
  organizationId: string,
  taskType: ExternalProviderTaskType,
  now = Date.now(),
): ExternalProviderKeyCandidate[] {
  const eligible = candidates.filter((candidate) =>
    isEligibleExternalKey(candidate, organizationId, taskType, now),
  );
  eligible.sort(compareExternalKeyCandidates);
  return eligible;
}

export function pickEligibleExternalKey(
  candidates: ExternalProviderKeyCandidate[],
  organizationId: string,
  taskType: ExternalProviderTaskType,
  now = Date.now(),
): ExternalProviderKeyCandidate | null {
  return orderedEligibleExternalKeys(candidates, organizationId, taskType, now)[0] ?? null;
}

@Injectable()
export class ExternalProviderPoolService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rateLimits: ExternalProviderRateLimitService,
    private readonly capacity: ExternalProviderCapacityService,
  ) {}

  async resolveCredential(
    organizationId: string,
    provider: ExternalProvider,
    taskType: ExternalProviderTaskType,
  ): Promise<ExternalProviderCredential | null> {
    if (!this.config.ENCRYPTION_KEY) {
      throw new Error(
        'ENCRYPTION_KEY must be configured before resolving external provider credentials',
      );
    }

    const candidates = orderedEligibleExternalKeys(
      await this.listKeyCandidates(provider),
      organizationId,
      taskType,
    );

    for (const candidate of candidates) {
      const decision = await this.rateLimits.claimProviderRequest(candidate);
      if (!decision.allowed) continue;
      return this.buildCredential(provider, candidate);
    }

    return null;
  }

  async claimCredential(
    organizationId: string,
    provider: ExternalProvider,
    taskType: ExternalProviderTaskType,
    estimate:
      | ExternalUsageMetrics
      | ((planProfile: ExternalProviderPlanProfileRow | null) => ExternalUsageMetrics),
    options: {
      entityType?: string | null;
      entityId?: string | null;
      requestHash?: string | null;
      inputSummary?: Record<string, unknown>;
    } = {},
  ): Promise<ExternalProviderCredentialClaim | null> {
    if (!this.config.ENCRYPTION_KEY) {
      throw new Error(
        'ENCRYPTION_KEY must be configured before resolving external provider credentials',
      );
    }

    const candidates = orderedEligibleExternalKeys(
      await this.listKeyCandidates(provider),
      organizationId,
      taskType,
    );

    for (const candidate of candidates) {
      const decision = await this.rateLimits.claimProviderRequest(candidate);
      if (!decision.allowed) continue;

      try {
        const resolvedEstimate =
          typeof estimate === 'function' ? estimate(candidate.planProfile) : estimate;
        const reservationId = await this.capacity.reserve({
          provider,
          providerAccountId: candidate.account.id,
          apiKeyId: candidate.key.id,
          taskType,
          entityType: options.entityType,
          entityId: options.entityId,
          requestHash: options.requestHash,
          inputSummary: toJson(options.inputSummary),
          estimate: resolvedEstimate,
        });

        return {
          credential: this.buildCredential(provider, candidate),
          reservationId,
          requestHash: options.requestHash ?? null,
          estimate: resolvedEstimate,
        };
      } catch {
        continue;
      }
    }

    return null;
  }

  private buildCredential(
    provider: ExternalProvider,
    candidate: ExternalProviderKeyCandidate,
  ): ExternalProviderCredential {
    const encryptionKey = this.config.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY must be configured before resolving external provider credentials');
    }

    return {
      provider,
      apiKey: decryptSecret(candidate.key.encrypted_api_key, encryptionKey),
      apiKeyId: candidate.key.id,
      providerAccountId: candidate.account.id,
      providerAccountName: candidate.account.account_name,
      baseUrl: candidate.account.base_url,
      isFreeTier: candidate.account.account_type === 'free_tier',
      keyName: candidate.key.key_name,
      maskedKeyPreview: candidate.key.masked_key_preview,
      planProfileId: candidate.account.plan_profile_id,
      planProfile: candidate.planProfile,
      keyState: candidate.key,
    };
  }

  async loadCredentialByKeyId(apiKeyId: string): Promise<ExternalProviderCredential | null> {
    const { data: key, error } = await this.supabase
      .from('external_api_keys')
      .select('*')
      .eq('id', apiKeyId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load external provider key ${apiKeyId}: ${error.message}`);
    }
    if (!key) return null;

    const { data: account, error: accountError } = await this.supabase
      .from('external_provider_accounts')
      .select('*')
      .eq('id', key.provider_account_id)
      .maybeSingle();

    if (accountError) {
      throw new Error(`Failed to load external provider account ${key.provider_account_id}: ${accountError.message}`);
    }
    if (!account) return null;

    let planProfile: ExternalProviderPlanProfileRow | null = null;
    if (account.plan_profile_id) {
      const { data: plan, error: planError } = await this.supabase
        .from('external_provider_plan_profiles')
        .select('*')
        .eq('id', account.plan_profile_id)
        .maybeSingle();

      if (planError) {
        throw new Error(`Failed to load external provider plan ${account.plan_profile_id}: ${planError.message}`);
      }
      planProfile = plan as ExternalProviderPlanProfileRow | null;
    }

    return this.buildCredential(account.provider, {
      key: key as ExternalApiKeyRow,
      account: account as ExternalProviderAccountRow,
      planProfile,
    });
  }

  private async listKeyCandidates(provider: ExternalProvider): Promise<ExternalProviderKeyCandidate[]> {
    const { data: keys, error } = await this.supabase
      .from('external_api_keys')
      .select('*')
      .eq('provider', provider)
      .is('revoked_at', null);

    if (error) {
      throw new Error(`Failed to load ${provider} external provider keys: ${error.message}`);
    }

    const providerKeys = (keys ?? []) as ExternalApiKeyRow[];
    if (providerKeys.length === 0) return [];

    const accountIds = [...new Set(providerKeys.map((key) => key.provider_account_id))];
    const { data: accounts, error: accountError } = await this.supabase
      .from('external_provider_accounts')
      .select('*')
      .in('id', accountIds);

    if (accountError) {
      throw new Error(`Failed to load ${provider} external provider accounts: ${accountError.message}`);
    }

    const accountMap = new Map(
      ((accounts ?? []) as ExternalProviderAccountRow[]).map((account) => [account.id, account] as const),
    );

    const planProfileIds = [...new Set(
      ((accounts ?? []) as ExternalProviderAccountRow[])
        .map((account) => account.plan_profile_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    )];
    const { data: planProfiles, error: planProfileError } = planProfileIds.length
      ? await this.supabase
          .from('external_provider_plan_profiles')
          .select('*')
          .in('id', planProfileIds)
      : { data: [], error: null };

    if (planProfileError) {
      throw new Error(`Failed to load ${provider} external provider plan profiles: ${planProfileError.message}`);
    }

    const planProfileMap = new Map(
      ((planProfiles ?? []) as ExternalProviderPlanProfileRow[]).map((planProfile) => [planProfile.id, planProfile] as const),
    );

    return providerKeys.flatMap((key) => {
      const account = accountMap.get(key.provider_account_id);
      return account
        ? [{
            key,
            account,
            planProfile: account.plan_profile_id ? planProfileMap.get(account.plan_profile_id) ?? null : null,
          }]
        : [];
    });
  }
}
