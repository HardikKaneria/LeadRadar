import { Inject, Injectable } from '@nestjs/common';
import type { Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type {
  ExternalCallStatus,
  ExternalProvider,
  ExternalProviderTaskType,
  ExternalUsageMetrics,
} from './external-provider.types';

@Injectable()
export class ExternalProviderCapacityService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async reserve(input: {
    provider: ExternalProvider;
    providerAccountId: string;
    apiKeyId: string;
    taskType: ExternalProviderTaskType;
    entityType?: string | null;
    entityId?: string | null;
    requestHash?: string | null;
    inputSummary?: Json;
    estimate: ExternalUsageMetrics;
    expiresAt?: string;
  }): Promise<string> {
    const { data, error } = await this.supabase.rpc('reserve_external_provider_usage', {
      p_provider: input.provider,
      p_provider_account_id: input.providerAccountId,
      p_api_key_id: input.apiKeyId,
      p_task_type: input.taskType,
      p_entity_type: input.entityType ?? null,
      p_entity_id: input.entityId ?? null,
      p_request_hash: input.requestHash ?? null,
      p_input_summary: input.inputSummary ?? {},
      p_reserved_request_count: input.estimate.requestCount,
      p_reserved_record_count: input.estimate.recordCount,
      p_reserved_page_count: input.estimate.pageCount,
      p_reserved_search_count: input.estimate.searchCount,
      p_reserved_credit_cost: input.estimate.creditCost,
      p_reserved_usd_credit_cost: input.estimate.usdCreditCost,
      p_reserved_units: input.estimate.usedUnits,
      p_reserved_cost_usd: input.estimate.estimatedCostUsd,
      p_expires_at: input.expiresAt ?? new Date(Date.now() + 15 * 60_000).toISOString(),
    });

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to reserve external provider capacity');
    }

    return data as string;
  }

  async settle(
    reservationId: string,
    usageEventId: string,
    status: ExternalCallStatus,
    usage: ExternalUsageMetrics,
  ): Promise<void> {
    const { error } = await this.supabase.rpc('settle_external_provider_reservation', {
      p_reservation_id: reservationId,
      p_usage_event_id: usageEventId,
      p_status: status,
      p_actual_request_count: usage.requestCount,
      p_actual_record_count: usage.recordCount,
      p_actual_credit_cost: usage.creditCost,
      p_actual_units: usage.usedUnits,
      p_actual_cost_usd: usage.paidCostUsd,
    });

    if (error) {
      throw new Error(`Failed to settle external provider reservation ${reservationId}: ${error.message}`);
    }
  }

  async release(
    reservationId: string,
    status: 'released' | 'expired' = 'released',
  ): Promise<void> {
    const { error } = await this.supabase.rpc('release_external_provider_reservation', {
      p_reservation_id: reservationId,
      p_status: status,
    });

    if (error) {
      throw new Error(`Failed to release external provider reservation ${reservationId}: ${error.message}`);
    }
  }

  async expireStaleReservations(now = new Date().toISOString()): Promise<number> {
    const { data, error } = await this.supabase
      .from('external_usage_reservations')
      .select('id')
      .eq('status', 'reserved')
      .lt('expires_at', now)
      .limit(500);

    if (error) {
      throw new Error(`Failed to load expired external reservations: ${error.message}`);
    }

    const reservations = data ?? [];
    for (const row of reservations) {
      await this.release(row.id, 'expired');
    }
    return reservations.length;
  }
}
