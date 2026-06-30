import { Inject, Injectable } from '@nestjs/common';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { ExternalProviderRateLimitService } from './external-provider-rate-limit.service';
import type {
  ExternalCallStatus,
  ExternalProvider,
  ExternalProviderCredential,
  ExternalProviderTaskType,
  ExternalUsageMetrics,
} from './external-provider.types';

type ExternalProviderCallInsert =
  Database['public']['Tables']['external_provider_calls']['Insert'];
type ExternalUsageEventInsert = Database['public']['Tables']['external_usage_events']['Insert'];
type ExternalRateLimitEventInsert =
  Database['public']['Tables']['external_provider_rate_limit_events']['Insert'];

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

@Injectable()
export class ExternalProviderUsageService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly rateLimits: ExternalProviderRateLimitService,
  ) {}

  async createCallAttempt(input: {
    organizationId: string;
    userId?: string | null;
    taskType: ExternalProviderTaskType;
    routeId?: string | null;
    provider: ExternalProvider;
    credential?: ExternalProviderCredential | null;
    rawPostId?: string | null;
    searchSessionId?: string | null;
    postResearchJobId?: string | null;
    jobRunId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    attemptNumber: number;
    requestRef?: Json;
    requestHash?: string | null;
  }): Promise<string> {
    const payload: ExternalProviderCallInsert = {
      organization_id: input.organizationId,
      user_id: input.userId ?? null,
      task_type: input.taskType,
      external_provider_route_id: input.routeId ?? null,
      provider: input.provider,
      provider_account_id: input.credential?.providerAccountId ?? null,
      api_key_id: input.credential?.apiKeyId ?? null,
      raw_post_id: input.rawPostId ?? null,
      post_research_job_id: input.postResearchJobId ?? null,
      job_run_id: input.jobRunId ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      search_session_id: input.searchSessionId ?? null,
      attempt_number: input.attemptNumber,
      request_ref: input.requestRef ?? {},
      request_hash: input.requestHash ?? null,
      status: 'ok',
    };

    const { data, error } = await this.supabase
      .from('external_provider_calls')
      .insert(payload)
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create external provider call row: ${error?.message ?? 'unknown error'}`);
    }

    return data.id;
  }

  async completeCallAttempt(
    callId: string,
    patch: Database['public']['Tables']['external_provider_calls']['Update'],
  ): Promise<void> {
    const { error } = await this.supabase.from('external_provider_calls').update(patch).eq('id', callId);
    if (error) {
      throw new Error(`Failed to update external provider call row ${callId}: ${error.message}`);
    }
  }

  async recordUsage(input: {
    organizationId: string;
    userId?: string | null;
    taskType: ExternalProviderTaskType;
    provider: ExternalProvider;
    credential?: ExternalProviderCredential | null;
    callId: string;
    rawPostId?: string | null;
    searchSessionId?: string | null;
    jobRunId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    requestHash?: string | null;
    providerRequestId?: string | null;
    responseSummary?: Json;
    errorCode?: string | null;
    errorMessage?: string | null;
    usage: ExternalUsageMetrics;
    status: ExternalCallStatus;
  }): Promise<string> {
    const payload: ExternalUsageEventInsert = {
      organization_id: input.organizationId,
      user_id: input.userId ?? null,
      provider: input.provider,
      task_type: input.taskType,
      external_provider_call_id: input.callId,
      api_key_id: input.credential?.apiKeyId ?? null,
      provider_account_id: input.credential?.providerAccountId ?? null,
      raw_post_id: input.rawPostId ?? null,
      search_session_id: input.searchSessionId ?? null,
      job_run_id: input.jobRunId ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      request_hash: input.requestHash ?? null,
      provider_request_id: input.providerRequestId ?? null,
      response_summary: input.responseSummary ?? {},
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      unit_type: input.usage.unitType,
      requests_count: input.usage.requestCount,
      units_consumed: input.usage.usedUnits,
      record_count: input.usage.recordCount,
      page_count: input.usage.pageCount,
      search_count: input.usage.searchCount,
      credit_cost: input.usage.creditCost,
      usd_credit_cost: input.usage.usdCreditCost,
      estimated_cost: roundCost(input.usage.estimatedCostUsd),
      free_units_applied: input.usage.freeUnitsApplied,
      paid_units_applied: input.usage.paidUnitsApplied,
      paid_cost_usd: roundCost(input.usage.paidCostUsd),
      status: input.status,
    };

    const { data, error } = await this.supabase
      .from('external_usage_events')
      .insert(payload)
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`Failed to insert external usage event: ${error.message}`);
    }

    return data.id;
  }

  async recordRateLimit(input: {
    provider: ExternalProvider;
    credential: ExternalProviderCredential;
    taskType: ExternalProviderTaskType;
    retryAfterSeconds?: number | null;
    detail?: Json;
  }): Promise<void> {
    const payload: ExternalRateLimitEventInsert = {
      provider: input.provider,
      provider_account_id: input.credential.providerAccountId,
      api_key_id: input.credential.apiKeyId,
      task_type: input.taskType,
      limit_type: 'rpm',
      retry_after_seconds: input.retryAfterSeconds ?? null,
      detail: input.detail ?? {},
    };

    const { error } = await this.supabase.from('external_provider_rate_limit_events').insert(payload);
    if (error) {
      throw new Error(`Failed to insert external provider rate-limit event: ${error.message}`);
    }

    const cooldownSeconds = this.rateLimits.providerCooldownSeconds(input.retryAfterSeconds);
    const cooldownUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString();
    const { error: keyError } = await this.supabase
      .from('external_api_keys')
      .update({
        status: 'cooldown',
        cooldown_until: cooldownUntil,
        last_used_at: new Date().toISOString(),
        last_error: 'External provider rate limited',
      })
      .eq('id', input.credential.apiKeyId);

    if (keyError) {
      throw new Error(`Failed to cooldown external provider key ${input.credential.apiKeyId}: ${keyError.message}`);
    }
  }

  async markKeyFailure(apiKeyId: string, message: string): Promise<void> {
    const { error } = await this.supabase
      .from('external_api_keys')
      .update({
        last_error: message,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', apiKeyId);

    if (error) {
      throw new Error(`Failed to mark external provider key failure ${apiKeyId}: ${error.message}`);
    }
  }

  async markKeyUnauthorized(apiKeyId: string, message: string): Promise<void> {
    const { error } = await this.supabase
      .from('external_api_keys')
      .update({
        status: 'failed',
        last_error: message,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', apiKeyId);

    if (error) {
      throw new Error(`Failed to mark external provider key unauthorized ${apiKeyId}: ${error.message}`);
    }
  }

  async recordHealthCheck(input: {
    provider: ExternalProvider;
    providerAccountId?: string | null;
    apiKeyId?: string | null;
    status: Database['public']['Enums']['external_provider_health_status'];
    latencyMs?: number | null;
    detail?: Json;
  }): Promise<void> {
    const { error } = await this.supabase.from('external_provider_health_checks').insert({
      provider: input.provider,
      provider_account_id: input.providerAccountId ?? null,
      api_key_id: input.apiKeyId ?? null,
      status: input.status,
      latency_ms: input.latencyMs ?? null,
      detail: input.detail ?? {},
    });

    if (error) {
      throw new Error(`Failed to insert external provider health check: ${error.message}`);
    }
  }
}
