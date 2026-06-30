import { Inject, Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import type {
  ExternalProviderAlertEventAdminDto,
  ExternalProviderAlertRuleAdminDto,
  ExternalProviderPlanProfileAdminDto,
  ExternalProviderReconciliationAdminDto,
  ExternalProviderTestRunAdminDto,
  ExternalProviderUsageAdminRow,
  ExternalProviderUsageAdminSummary,
  ExternalProviderUsageEventAdminDto,
  ExternalProviderUsageForecastAdminSummary,
  ExternalProviderUsageSnapshotAdminDto,
  LeadHuntingUsageBucket,
} from '@radar/contracts';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AuditService } from '../audit/audit.service';
import { ExternalProviderAdapterRegistryService } from './external-provider-adapter-registry.service';
import { ExternalProviderCapacityService } from './external-provider-capacity.service';
import { ExternalCostCalculatorService } from './external-cost-calculator.service';
import type {
  ExternalAlertEventRow,
  ExternalAlertRuleRow,
  ExternalApiKeyRow,
  ExternalProviderAccountRow,
  ExternalProviderPlanProfileRow,
  ExternalProviderTaskType,
  ExternalProviderTestRunRow,
  ExternalUsageMetrics,
  ExternalUsageReconciliationRow,
  ExternalUsageSnapshotRow,
} from './external-provider.types';

type ExternalUsageEventRow = Database['public']['Tables']['external_usage_events']['Row'];

function asNumber(value: number | string | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function monthWindow(period?: string): { start: string; end: string; label: string } {
  const parsed =
    typeof period === 'string' && /^\d{4}-\d{2}$/.test(period)
      ? dayjs(`${period}-01T00:00:00.000Z`)
      : dayjs().startOf('month');
  return {
    start: parsed.startOf('month').toISOString(),
    end: parsed.endOf('month').toISOString(),
    label: parsed.format('YYYY-MM'),
  };
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? {})) as Json;
}

function mapPlan(row: ExternalProviderPlanProfileRow): ExternalProviderPlanProfileAdminDto {
  return {
    id: row.id,
    provider: row.provider,
    planName: row.plan_name,
    planType: row.plan_type,
    unitType: row.unit_type,
    freeEntitlementAmount: asNumber(row.free_entitlement_amount),
    includedUnits: asNumber(row.included_units),
    renewalInterval: row.renewal_interval,
    renewalTimezone: row.renewal_timezone,
    renewalAnchorDay: row.renewal_anchor_day,
    trialStartsAt: row.trial_starts_at,
    trialEndsAt: row.trial_ends_at,
    overageEnabled: row.overage_enabled,
    overageUnitPrice: asNumber(row.overage_unit_price),
    currency: row.currency,
    costRules: row.cost_rules,
    providerDashboardUrl: row.provider_dashboard_url,
    testEnabled: row.test_enabled,
    testTaskType: row.test_task_type,
    testPayloadJson: row.test_payload_json,
    testConsumesCredits: row.test_consumes_credits,
    expectedResponseShapeJson: row.expected_response_shape_json,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSnapshot(row: ExternalUsageSnapshotRow): ExternalProviderUsageSnapshotAdminDto {
  return {
    id: row.id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    apiKeyId: row.api_key_id,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    unitType: row.unit_type,
    entitlementUnits: asNumber(row.entitlement_units),
    usedUnits: asNumber(row.used_units),
    remainingUnits: asNumber(row.remaining_units),
    usagePercent: asNumber(row.usage_percent),
    estimatedPaidCostUsd: asNumber(row.estimated_paid_cost_usd),
    projectedExhaustionAt: row.projected_exhaustion_at,
    projectedPeriodCostUsd: asNumber(row.projected_period_cost_usd),
    usageVelocityPerDay: asNumber(row.usage_velocity_per_day),
    isEstimated: row.is_estimated,
    calculatedAt: row.calculated_at,
  };
}

function mapUsageEvent(row: ExternalUsageEventRow): ExternalProviderUsageEventAdminDto {
  return {
    id: row.id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    apiKeyId: row.api_key_id,
    taskType: row.task_type,
    organizationId: row.organization_id,
    userId: row.user_id,
    searchSessionId: row.search_session_id,
    rawPostId: row.raw_post_id,
    jobRunId: row.job_run_id,
    unitType: row.unit_type,
    status: row.status,
    requests: row.requests_count,
    records: Number(row.record_count ?? 0),
    pages: Number(row.page_count ?? 0),
    searches: Number(row.search_count ?? 0),
    usedUnits: asNumber(row.units_consumed),
    creditCost: asNumber(row.credit_cost),
    usdCreditCost: asNumber(row.usd_credit_cost),
    freeUnitsApplied: asNumber(row.free_units_applied),
    paidUnitsApplied: asNumber(row.paid_units_applied),
    estimatedCostUsd: asNumber(row.estimated_cost),
    paidCostUsd: asNumber(row.paid_cost_usd),
    providerRequestId: row.provider_request_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    // P10-14 cost breakdown fields
    endpointKey: row.endpoint_key ?? null,
    datasetKey: row.dataset_key ?? null,
    actorKey: row.actor_key ?? null,
    baseUnits: asNumber(row.base_units),
    multiplierTotal: row.multiplier_total != null ? asNumber(row.multiplier_total) : 1,
    finalUnits: asNumber(row.final_units),
    billableUnits: asNumber(row.billable_units),
    successfulRecordCount: asNumber(row.successful_record_count),
    failedRecordCount: asNumber(row.failed_record_count),
    resultCount: asNumber(row.result_count),
    browserMinutes: asNumber(row.browser_minutes),
    dataMb: asNumber(row.data_transfer_mb),
    unitPriceUsd: asNumber(row.unit_price_usd),
    calculatedCostUsd: asNumber(row.calculated_cost_usd),
    providerReportedUnits: row.provider_reported_units ?? null,
    providerReportedCostUsd: row.provider_reported_cost_usd ?? null,
    costSource: row.cost_source ?? null,
    costRuleId: row.cost_rule_id ?? null,
    costBreakdownJson: (row.cost_breakdown_json ?? {}) as Record<string, unknown>,
  };
}

function zeroBucket(): LeadHuntingUsageBucket {
  return {
    capturedPosts: 0,
    researchRuns: 0,
    qualifiedPosts: 0,
    needsReviewPosts: 0,
    archivedPosts: 0,
    rejectedPosts: 0,
    providerCalls: 0,
    providerCostUsd: 0,
  };
}

@Injectable()
export class ExternalProviderIntelligenceService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly registry: ExternalProviderAdapterRegistryService,
    private readonly capacity: ExternalProviderCapacityService,
    private readonly calculator: ExternalCostCalculatorService,
    private readonly audit: AuditService,
  ) {}

  async listPlanProfiles(): Promise<{ items: ExternalProviderPlanProfileAdminDto[] }> {
    const { data, error } = await this.supabase
      .from('external_provider_plan_profiles')
      .select('*')
      .order('provider', { ascending: true })
      .order('plan_name', { ascending: true });

    if (error) throw new Error(`Failed to load external provider plan profiles: ${error.message}`);
    return { items: ((data ?? []) as ExternalProviderPlanProfileRow[]).map(mapPlan) };
  }

  async recalculateUsage(filters: {
    providerAccountId?: string;
    apiKeyId?: string;
  } = {}): Promise<ExternalProviderUsageSnapshotAdminDto[]> {
    const contexts = await this.loadKeyContexts(filters);
    const snapshots: ExternalProviderUsageSnapshotAdminDto[] = [];

    for (const context of contexts) {
      const period = this.calculator.resolvePeriodWindow(context.planProfile);
      const { data, error } = await this.supabase
        .from('external_usage_events')
        .select('*')
        .eq('api_key_id', context.key.id)
        .gte('created_at', period.start)
        .lte('created_at', period.end)
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Failed to load external usage events for ${context.key.id}: ${error.message}`);
      }

      const events = (data ?? []) as ExternalUsageEventRow[];
      const usedUnits = events.reduce((sum, row) => sum + asNumber(row.units_consumed), 0);
      const estimatedPaidCostUsd = events.reduce((sum, row) => sum + asNumber(row.paid_cost_usd), 0);
      const entitlementUnits = asNumber(context.planProfile?.free_entitlement_amount ?? 0);
      const remainingUnits = Math.max(entitlementUnits - usedUnits, 0);
      const usagePercent = this.calculator.calculateUsagePercent(usedUnits, entitlementUnits);
      const usageHistory = events.map((row) => ({
        timestamp: row.created_at,
        usedUnits: usedUnits - events.slice(events.indexOf(row) + 1).reduce((sum, item) => sum + asNumber(item.units_consumed), 0),
      }));
      const projectedExhaustionAt = this.calculator.calculateProjectedExhaustion(usageHistory, remainingUnits);
      const usageVelocityPerDay = this.calculateVelocityPerDay(events, period.start, period.end);
      const projectedPeriodCostUsd = this.calculator.calculateProjectedPeriodCost(
        usageVelocityPerDay,
        period.end,
        asNumber(context.planProfile?.overage_unit_price ?? 0),
        remainingUnits,
      );

      const { data: upserted, error: upsertError } = await this.supabase
        .from('external_usage_snapshots')
        .upsert({
          provider: context.account.provider,
          provider_account_id: context.account.id,
          api_key_id: context.key.id,
          period_type: period.periodType,
          period_start: period.start,
          period_end: period.end,
          unit_type: context.planProfile?.unit_type ?? 'credit',
          entitlement_units: entitlementUnits,
          used_units: usedUnits,
          remaining_units: remainingUnits,
          usage_percent: usagePercent,
          estimated_paid_cost_usd: estimatedPaidCostUsd,
          projected_exhaustion_at: projectedExhaustionAt,
          projected_period_cost_usd: projectedPeriodCostUsd,
          usage_velocity_per_day: usageVelocityPerDay,
          is_estimated: true,
          calculated_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (upsertError || !upserted) {
        throw new Error(`Failed to upsert external usage snapshot for ${context.key.id}: ${upsertError?.message ?? 'unknown'}`);
      }

      await this.evaluateAlerts(context.account, context.key, context.planProfile, upserted as ExternalUsageSnapshotRow);
      snapshots.push(mapSnapshot(upserted as ExternalUsageSnapshotRow));
    }

    return snapshots;
  }

  async getUsageSummary(
    period?: string,
    organizationId?: string,
  ): Promise<ExternalProviderUsageAdminSummary> {
    const window = monthWindow(period);
    const snapshots = await this.listSnapshots({ limit: 200, periodType: 'monthly' }).catch(() => ({ items: [] }));
    const recentEvents = await this.listUsageEvents({ period: window.label, limit: 200, organizationId });
    const healthRateLimits = await this.listRecentRateLimits(window.start);

    const rows = recentEvents.items;
    const byProvider = this.aggregateRows(rows, (row) => `${row.provider}`);
    const byTask = this.aggregateRows(rows, (row) => `${row.provider}:${row.taskType}`);
    const byOrganization = this.aggregateRows(rows, (row) => row.organizationId);
    const byUser = this.aggregateRows(rows, (row) => row.userId ?? 'unknown');
    const bySearchSession = this.aggregateRows(rows, (row) => row.searchSessionId ?? 'unknown');

    const totals = rows.reduce(
      (acc, row) => {
        acc.requests += row.requests;
        acc.usedUnits += row.usedUnits;
        acc.estimatedCostUsd += row.estimatedCostUsd;
        acc.paidCostUsd += row.paidCostUsd;
        acc.fallbackCount += row.status === 'fallback' ? 1 : 0;
        acc.failedCalls += row.status === 'failed' ? 1 : 0;
        acc.skippedCacheCount += row.status === 'skipped_cache' ? 1 : 0;
        return acc;
      },
      {
        requests: 0,
        usedUnits: 0,
        estimatedCostUsd: 0,
        paidCostUsd: 0,
        rateLimitEvents: healthRateLimits.length,
        fallbackCount: 0,
        failedCalls: 0,
        skippedCacheCount: 0,
      },
    );

    return {
      period: window.label,
      totals,
      byProvider,
      byTask,
      byOrganization,
      byUser,
      bySearchSession,
      recentRateLimits: healthRateLimits,
      snapshots: snapshots.items,
      recentEvents: rows,
    };
  }

  async getUsageForecast(
    period?: string,
    organizationId?: string,
  ): Promise<ExternalProviderUsageForecastAdminSummary> {
    const summary = await this.getUsageSummary(period, organizationId);
    const currentPeriod = summary.snapshots;
    const velocity = {
      averageUnitsPerHour:
        currentPeriod.reduce((sum, snapshot) => sum + snapshot.usageVelocityPerDay / 24, 0) /
        Math.max(currentPeriod.length, 1),
      averageUnitsPerDay:
        currentPeriod.reduce((sum, snapshot) => sum + snapshot.usageVelocityPerDay, 0) /
        Math.max(currentPeriod.length, 1),
      peakUsageDay: this.pickPeakDay(summary.recentEvents),
      last24hUsage: this.sumUsageSince(summary.recentEvents, dayjs().subtract(24, 'hour').toISOString()),
      last7dUsage: this.sumUsageSince(summary.recentEvents, dayjs().subtract(7, 'day').toISOString()),
    };

    const qualified = await this.countTable('post_classifications', 'created_at', period, organizationId, {
      eq: { is_actual_lead: true },
    });
    const archived = await this.countTable('archived_posts', 'created_at', period, organizationId);
    const captured = await this.countTable('raw_posts', 'created_at', period, organizationId);
    const researched = await this.countTable('post_research_jobs', 'created_at', period, organizationId);
    const discoveries = await this.countTable('discoveries', 'created_at', period, organizationId);

    const paidCost = summary.totals.paidCostUsd;
    return {
      period: summary.period,
      currentPeriod,
      velocity,
      projections: {
        projectedExhaustionAt: currentPeriod
          .map((snapshot) => snapshot.projectedExhaustionAt)
          .filter((value): value is string => typeof value === 'string')
          .sort()[0] ?? null,
        projectedPeriodEndUsage: currentPeriod.reduce((sum, snapshot) => sum + snapshot.usedUnits, 0),
        projectedPaidUnits: summary.recentEvents.reduce((sum, row) => sum + row.paidUnitsApplied, 0),
        projectedPaidCostUsd: currentPeriod.reduce((sum, snapshot) => sum + snapshot.projectedPeriodCostUsd, 0),
      },
      businessEfficiency: {
        costPerCapturedPost: captured > 0 ? paidCost / captured : null,
        costPerResearchedPost: researched > 0 ? paidCost / researched : null,
        costPerQualifiedLead: qualified > 0 ? paidCost / qualified : null,
        costPerArchivedPost: archived > 0 ? paidCost / archived : null,
        costPerOpportunity: discoveries > 0 ? paidCost / discoveries : null,
      },
      savings: {
        freeCreditsUsed: summary.recentEvents.reduce((sum, row) => sum + row.freeUnitsApplied, 0),
        estimatedCostAvoidedUsd: summary.recentEvents
          .filter((row) => row.status === 'skipped_cache')
          .reduce((sum, row) => sum + row.estimatedCostUsd, 0),
        paidOverageRiskUsd: currentPeriod.reduce((sum, snapshot) => sum + snapshot.projectedPeriodCostUsd, 0),
      },
    };
  }

  async listUsageEvents(input: {
    period?: string;
    organizationId?: string;
    limit?: number;
  }): Promise<{ items: ExternalProviderUsageEventAdminDto[] }> {
    const window = monthWindow(input.period);
    let query = this.supabase
      .from('external_usage_events')
      .select('*')
      .gte('created_at', window.start)
      .lte('created_at', window.end)
      .order('created_at', { ascending: false })
      .limit(input.limit ?? 500);

    if (input.organizationId) {
      query = query.eq('organization_id', input.organizationId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load external usage events: ${error.message}`);
    return { items: ((data ?? []) as ExternalUsageEventRow[]).map(mapUsageEvent) };
  }

  async listSnapshots(input: {
    limit?: number;
    periodType?: 'daily' | 'weekly' | 'monthly' | 'trial' | 'custom';
  } = {}): Promise<{ items: ExternalProviderUsageSnapshotAdminDto[] }> {
    let query = this.supabase
      .from('external_usage_snapshots')
      .select('*')
      .order('calculated_at', { ascending: false })
      .limit(input.limit ?? 200);

    if (input.periodType) query = query.eq('period_type', input.periodType);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load external usage snapshots: ${error.message}`);
    return { items: ((data ?? []) as ExternalUsageSnapshotRow[]).map(mapSnapshot) };
  }

  async listAlerts(limit = 200): Promise<{
    rules: ExternalProviderAlertRuleAdminDto[];
    events: ExternalProviderAlertEventAdminDto[];
  }> {
    const [{ data: rules, error: rulesError }, { data: events, error: eventsError }] = await Promise.all([
      this.supabase.from('external_alert_rules').select('*').order('created_at', { ascending: true }),
      this.supabase
        .from('external_alert_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    if (rulesError) throw new Error(`Failed to load external alert rules: ${rulesError.message}`);
    if (eventsError) throw new Error(`Failed to load external alert events: ${eventsError.message}`);

    return {
      rules: ((rules ?? []) as ExternalAlertRuleRow[]).map((row) => ({
        id: row.id,
        provider: row.provider,
        apiKeyId: row.api_key_id,
        thresholdPercent: row.threshold_percent == null ? null : Number(row.threshold_percent),
        alertType: row.alert_type,
        notifyMasterAdmin: row.notify_master_admin,
        notifyCompanyAdmin: row.notify_company_admin,
        isActive: row.is_active,
        createdAt: row.created_at,
      })),
      events: ((events ?? []) as ExternalAlertEventRow[]).map((row) => ({
        id: row.id,
        provider: row.provider,
        providerAccountId: row.provider_account_id,
        apiKeyId: row.api_key_id,
        alertRuleId: row.alert_rule_id,
        alertType: row.alert_type,
        thresholdPercent: row.threshold_percent == null ? null : Number(row.threshold_percent),
        message: row.message,
        data: row.data,
        status: row.status,
        createdAt: row.created_at,
        acknowledgedBy: row.acknowledged_by,
        acknowledgedAt: row.acknowledged_at,
      })),
    };
  }

  async acknowledgeAlert(
    auditOrganizationId: string,
    actorUserId: string,
    alertId: string,
  ): Promise<{ success: boolean }> {
    const { data, error } = await this.supabase
      .from('external_alert_events')
      .update({
        status: 'acknowledged',
        acknowledged_by: actorUserId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to acknowledge external alert ${alertId}: ${error?.message ?? 'unknown'}`);
    }

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.alert.acknowledged',
      entityType: 'external_alert_event',
      entityId: alertId,
      after: data,
    });

    return { success: true };
  }

  async listTestRuns(limit = 100): Promise<{ items: ExternalProviderTestRunAdminDto[] }> {
    const { data, error } = await this.supabase
      .from('external_provider_test_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to load external provider test runs: ${error.message}`);
    return {
      items: ((data ?? []) as ExternalProviderTestRunRow[]).map((row) => ({
        id: row.id,
        provider: row.provider,
        providerAccountId: row.provider_account_id,
        apiKeyId: row.api_key_id,
        taskType: row.task_type,
        testName: row.test_name,
        status: row.status,
        requestPayload: row.request_payload,
        responseSummary: row.response_summary,
        latencyMs: row.latency_ms,
        estimatedUnitsUsed: asNumber(row.estimated_units_used),
        estimatedCostUsd: asNumber(row.estimated_cost_usd),
        errorCode: row.error_code,
        errorMessage: row.error_message,
        jobRunId: row.job_run_id,
        createdBy: row.created_by,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      })),
    };
  }

  async listReconciliations(limit = 100): Promise<{ items: ExternalProviderReconciliationAdminDto[] }> {
    const { data, error } = await this.supabase
      .from('external_usage_reconciliations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to load external provider reconciliations: ${error.message}`);
    return {
      items: ((data ?? []) as ExternalUsageReconciliationRow[]).map((row) => ({
        id: row.id,
        provider: row.provider,
        providerAccountId: row.provider_account_id,
        apiKeyId: row.api_key_id,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        internalUsedUnits: asNumber(row.internal_used_units),
        providerReportedUnits: row.provider_reported_units == null ? null : Number(row.provider_reported_units),
        varianceUnits: row.variance_units == null ? null : Number(row.variance_units),
        variancePercent: row.variance_percent == null ? null : Number(row.variance_percent),
        status: row.status,
        rawSummary: row.raw_summary,
        createdAt: row.created_at,
      })),
    };
  }

  async reconcileUsage(input: {
    provider: ExternalProviderAccountRow['provider'];
    providerAccountId: string | null;
    apiKeyId: string | null;
    periodStart: string;
    periodEnd: string;
    internalUsedUnits: number;
    providerReportedUnits: number | null;
    rawSummary: unknown;
    status?: ExternalUsageReconciliationRow['status'];
  }): Promise<{ id: string }> {
    const varianceUnits =
      input.providerReportedUnits == null ? null : input.providerReportedUnits - input.internalUsedUnits;
    const variancePercent =
      input.providerReportedUnits == null || input.internalUsedUnits <= 0
        ? null
        : (varianceUnits ?? 0) / input.internalUsedUnits * 100;

    const { data, error } = await this.supabase
      .from('external_usage_reconciliations')
      .insert({
        provider: input.provider,
        provider_account_id: input.providerAccountId,
        api_key_id: input.apiKeyId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        internal_used_units: input.internalUsedUnits,
        provider_reported_units: input.providerReportedUnits,
        variance_units: varianceUnits,
        variance_percent: variancePercent,
        status: input.status ?? (input.providerReportedUnits == null ? 'unsupported' : 'variance_detected'),
        raw_summary: (input.rawSummary ?? {}) as Record<string, unknown>,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create external usage reconciliation: ${error?.message ?? 'unknown'}`);
    }

    return { id: data.id };
  }

  async runResetCheck(): Promise<void> {
    await this.capacity.expireStaleReservations();
    const now = new Date().toISOString();
    const contexts = await this.loadKeyContexts();
    const resetWeeklyAccounts = new Set<string>();
    const resetMonthlyAccounts = new Set<string>();

    for (const context of contexts) {
      const patch: Database['public']['Tables']['external_api_keys']['Update'] = {};
      let renewed = false;

      if (context.key.reset_daily_at && context.key.reset_daily_at <= now) {
        patch.requests_used_today = 0;
        patch.units_used_today = 0;
        patch.records_used_today = 0;
        patch.credits_used_today = 0;
        patch.cost_used_today = 0;
        patch.reset_daily_at = dayjs(context.key.reset_daily_at).add(1, 'day').toISOString();
        renewed = true;
      }

      if (context.key.reset_weekly_at && context.key.reset_weekly_at <= now) {
        patch.requests_used_week = 0;
        patch.units_used_week = 0;
        patch.records_used_week = 0;
        patch.credits_used_week = 0;
        patch.cost_used_week = 0;
        patch.reset_weekly_at = dayjs(context.key.reset_weekly_at).add(1, 'week').toISOString();
        resetWeeklyAccounts.add(context.account.id);
        renewed = true;
      }

      if (context.key.reset_monthly_at && context.key.reset_monthly_at <= now) {
        patch.requests_used_month = 0;
        patch.units_used_month = 0;
        patch.records_used_month = 0;
        patch.credits_used_month = 0;
        patch.cost_used_month = 0;
        patch.reset_monthly_at = dayjs(context.key.reset_monthly_at).add(1, 'month').toISOString();
        resetMonthlyAccounts.add(context.account.id);
        renewed = true;
      }

      if (context.planProfile?.renewal_interval === 'trial' && context.planProfile.trial_ends_at && context.planProfile.trial_ends_at <= now) {
        patch.status = 'expired';
        await this.supabase
          .from('external_provider_accounts')
          .update({ status: 'expired', updated_at: now })
          .eq('id', context.account.id);
      } else if (renewed && context.key.status === 'exhausted') {
        patch.status = 'active';
      }

      if (Object.keys(patch).length > 0) {
        await this.recalculateUsage({ apiKeyId: context.key.id }).catch(() => null);
        const { error } = await this.supabase
          .from('external_api_keys')
          .update({ ...patch, updated_at: now })
          .eq('id', context.key.id);
        if (error) {
          throw new Error(`Failed to reset external provider key ${context.key.id}: ${error.message}`);
        }

        if (renewed) {
          await this.createAlertEvent({
            provider: context.account.provider,
            providerAccountId: context.account.id,
            apiKeyId: context.key.id,
            alertType: 'renewed',
            thresholdPercent: null,
            message: `${context.account.provider} free-tier capacity renewed for ${context.key.key_name}.`,
            data: {
              accountName: context.account.account_name,
              keyName: context.key.key_name,
            },
            dedupeKey: `renewed:${context.key.id}:${dayjs(now).format('YYYY-MM-DD-HH')}`,
            notifyMasterAdmin: true,
            notifyCompanyAdmin: !!context.account.organization_id,
          });
        }
      }
    }

    if (resetWeeklyAccounts.size > 0) {
      await this.supabase
        .from('external_provider_accounts')
        .update({ weekly_usage: 0, status: 'active', updated_at: now })
        .in('id', [...resetWeeklyAccounts]);
    }
    if (resetMonthlyAccounts.size > 0) {
      await this.supabase
        .from('external_provider_accounts')
        .update({ monthly_usage: 0, status: 'active', updated_at: now })
        .in('id', [...resetMonthlyAccounts]);
    }
  }

  async syncUsage(): Promise<void> {
    const contexts = await this.loadKeyContexts();
    for (const context of contexts) {
      const adapter = this.registry.get(context.account.provider);
      if (!adapter?.syncUsage) continue;

      const period = this.calculator.resolvePeriodWindow(context.planProfile);
      const synced = await adapter.syncUsage({
        credential: {
          provider: context.account.provider,
          apiKey: '',
          apiKeyId: context.key.id,
          providerAccountId: context.account.id,
          providerAccountName: context.account.account_name,
          baseUrl: context.account.base_url,
          isFreeTier: context.account.account_type === 'free_tier',
          keyName: context.key.key_name,
          maskedKeyPreview: context.key.masked_key_preview,
          planProfileId: context.account.plan_profile_id,
          planProfile: context.planProfile,
          keyState: context.key,
        },
        planProfile: context.planProfile,
        periodType: period.periodType,
        periodStart: period.start,
        periodEnd: period.end,
      }).catch(() => null);

      if (!synced) continue;
      const latestSnapshot = await this.latestSnapshotForKey(context.key.id);
      const reconciliation = await this.reconcileUsage({
        provider: context.account.provider,
        providerAccountId: context.account.id,
        apiKeyId: context.key.id,
        periodStart: synced.periodStart,
        periodEnd: synced.periodEnd,
        internalUsedUnits: latestSnapshot?.usedUnits ?? 0,
        providerReportedUnits: synced.providerReportedUnits,
        rawSummary: synced.rawSummary,
        status: 'variance_detected',
      });

      const variancePercent =
        latestSnapshot && latestSnapshot.usedUnits > 0
          ? Math.abs((synced.providerReportedUnits - latestSnapshot.usedUnits) / latestSnapshot.usedUnits) * 100
          : 0;

      if (variancePercent >= 5) {
        await this.createAlertEvent({
          provider: context.account.provider,
          providerAccountId: context.account.id,
          apiKeyId: context.key.id,
          alertType: 'variance_detected',
          thresholdPercent: variancePercent,
          message: `${context.account.provider} usage differs from the provider report by ${variancePercent.toFixed(2)}%.`,
          data: {
            reconciliationId: reconciliation.id,
            internalUsedUnits: latestSnapshot?.usedUnits ?? 0,
            providerReportedUnits: synced.providerReportedUnits,
          },
          dedupeKey: `variance:${context.key.id}:${period.start}`,
          notifyMasterAdmin: true,
          notifyCompanyAdmin: !!context.account.organization_id,
        });
      }
    }
  }

  private async loadKeyContexts(filters: {
    providerAccountId?: string;
    apiKeyId?: string;
  } = {}): Promise<Array<{
    account: ExternalProviderAccountRow;
    key: ExternalApiKeyRow;
    planProfile: ExternalProviderPlanProfileRow | null;
  }>> {
    let keyQuery = this.supabase.from('external_api_keys').select('*');
    if (filters.providerAccountId) keyQuery = keyQuery.eq('provider_account_id', filters.providerAccountId);
    if (filters.apiKeyId) keyQuery = keyQuery.eq('id', filters.apiKeyId);
    const { data: keys, error: keysError } = await keyQuery;
    if (keysError) throw new Error(`Failed to load external keys: ${keysError.message}`);

    const keyRows = (keys ?? []) as ExternalApiKeyRow[];
    if (keyRows.length === 0) return [];

    const accountIds = [...new Set(keyRows.map((row) => row.provider_account_id))];
    const { data: accounts, error: accountsError } = await this.supabase
      .from('external_provider_accounts')
      .select('*')
      .in('id', accountIds);
    if (accountsError) throw new Error(`Failed to load external accounts: ${accountsError.message}`);

    const accountRows = (accounts ?? []) as ExternalProviderAccountRow[];
    const planIds = [...new Set(accountRows.map((row) => row.plan_profile_id).filter((value): value is string => !!value))];
    const { data: plans, error: plansError } = planIds.length
      ? await this.supabase.from('external_provider_plan_profiles').select('*').in('id', planIds)
      : { data: [], error: null };
    if (plansError) throw new Error(`Failed to load external plans: ${plansError.message}`);

    const accountMap = new Map(accountRows.map((row) => [row.id, row] as const));
    const planMap = new Map(((plans ?? []) as ExternalProviderPlanProfileRow[]).map((row) => [row.id, row] as const));

    return keyRows.flatMap((key) => {
      const account = accountMap.get(key.provider_account_id);
      if (!account) return [];
      return [{
        account,
        key,
        planProfile: account.plan_profile_id ? planMap.get(account.plan_profile_id) ?? null : null,
      }];
    });
  }

  private async latestSnapshotForKey(apiKeyId: string): Promise<ExternalProviderUsageSnapshotAdminDto | null> {
    const { data, error } = await this.supabase
      .from('external_usage_snapshots')
      .select('*')
      .eq('api_key_id', apiKeyId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return data ? mapSnapshot(data as ExternalUsageSnapshotRow) : null;
  }

  private calculateVelocityPerDay(
    events: ExternalUsageEventRow[],
    periodStart: string,
    periodEnd: string,
  ): number {
    if (events.length === 0) return 0;
    const spanDays = Math.max((Date.parse(periodEnd) - Date.parse(periodStart)) / 86_400_000, 1);
    const usedUnits = events.reduce((sum, row) => sum + asNumber(row.units_consumed), 0);
    return usedUnits / spanDays;
  }

  private aggregateRows(
    rows: ExternalProviderUsageEventAdminDto[],
    keyOf: (row: ExternalProviderUsageEventAdminDto) => string,
  ): ExternalProviderUsageAdminRow[] {
    const map = new Map<string, ExternalProviderUsageAdminRow>();
    for (const row of rows) {
      const key = keyOf(row);
      const current =
        map.get(key) ??
        {
          provider: row.provider,
          taskType: row.taskType,
          providerAccountId: row.providerAccountId,
          apiKeyId: row.apiKeyId,
          organizationId: row.organizationId,
          userId: row.userId,
          searchSessionId: row.searchSessionId,
          unitType: row.unitType,
          requests: 0,
          records: 0,
          pages: 0,
          searches: 0,
          usedUnits: 0,
          freeUnitsApplied: 0,
          paidUnitsApplied: 0,
          estimatedCostUsd: 0,
          paidCostUsd: 0,
          skippedCacheCount: 0,
          failedCalls: 0,
          lastSeenAt: null,
        };
      current.requests += row.requests;
      current.records += row.records;
      current.pages += row.pages;
      current.searches += row.searches;
      current.usedUnits += row.usedUnits;
      current.freeUnitsApplied += row.freeUnitsApplied;
      current.paidUnitsApplied += row.paidUnitsApplied;
      current.estimatedCostUsd += row.estimatedCostUsd;
      current.paidCostUsd += row.paidCostUsd;
      current.skippedCacheCount += row.status === 'skipped_cache' ? 1 : 0;
      current.failedCalls += row.status === 'failed' ? 1 : 0;
      current.lastSeenAt =
        current.lastSeenAt && current.lastSeenAt > row.createdAt ? current.lastSeenAt : row.createdAt;
      map.set(key, current);
    }
    return [...map.values()];
  }

  private pickPeakDay(events: ExternalProviderUsageEventAdminDto[]): string | null {
    const usageByDay = new Map<string, number>();
    for (const event of events) {
      const key = event.createdAt.slice(0, 10);
      usageByDay.set(key, (usageByDay.get(key) ?? 0) + event.usedUnits);
    }
    return [...usageByDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  private sumUsageSince(events: ExternalProviderUsageEventAdminDto[], sinceIso: string): number {
    return events
      .filter((row) => row.createdAt >= sinceIso)
      .reduce((sum, row) => sum + row.usedUnits, 0);
  }

  private async countTable(
    table: 'post_classifications' | 'archived_posts' | 'raw_posts' | 'post_research_jobs' | 'discoveries',
    createdAtColumn: string,
    period: string | undefined,
    organizationId?: string,
    options: { eq?: Record<string, unknown> } = {},
  ): Promise<number> {
    const window = monthWindow(period);
    let query = this.supabase
      .from(table)
      .select('id', { head: true, count: 'exact' })
      .gte(createdAtColumn, window.start)
      .lte(createdAtColumn, window.end);

    if (organizationId && table !== 'discoveries') {
      query = query.eq('organization_id', organizationId);
    }
    if (organizationId && table === 'discoveries') {
      query = query.eq('organization_id', organizationId);
    }
    for (const [key, value] of Object.entries(options.eq ?? {})) {
      query = query.eq(key, value as never);
    }

    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  }

  private async listRecentRateLimits(startIso: string): Promise<ExternalProviderUsageAdminSummary['recentRateLimits']> {
    const { data, error } = await this.supabase
      .from('external_provider_rate_limit_events')
      .select('*')
      .gte('occurred_at', startIso)
      .order('occurred_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`Failed to load external provider rate limits: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      provider: row.provider,
      taskType: row.task_type,
      limitType: row.limit_type,
      retryAfterSeconds: row.retry_after_seconds,
      occurredAt: row.occurred_at,
    }));
  }

  private async evaluateAlerts(
    account: ExternalProviderAccountRow,
    key: ExternalApiKeyRow,
    planProfile: ExternalProviderPlanProfileRow | null,
    snapshot: ExternalUsageSnapshotRow,
  ): Promise<void> {
    const { data: rules, error } = await this.supabase
      .from('external_alert_rules')
      .select('*')
      .eq('is_active', true)
      .or(`provider.is.null,provider.eq.${account.provider}`);
    if (error) throw new Error(`Failed to load external alert rules: ${error.message}`);

    for (const rule of (rules ?? []) as ExternalAlertRuleRow[]) {
      if (rule.api_key_id && rule.api_key_id !== key.id) continue;

      const threshold = rule.threshold_percent == null ? null : Number(rule.threshold_percent);
      const shouldFire =
        threshold != null
          ? Number(snapshot.usage_percent) >= threshold
          : rule.alert_type === 'projected_exhaustion'
            ? !!snapshot.projected_exhaustion_at && dayjs(snapshot.projected_exhaustion_at).isBefore(dayjs().add(3, 'day'))
            : rule.alert_type === 'paid_cost_risk'
              ? Number(snapshot.projected_period_cost_usd) > 0
              : rule.alert_type === 'trial_expiry'
                ? !!planProfile?.trial_ends_at && dayjs(planProfile.trial_ends_at).isBefore(dayjs().add(7, 'day'))
                : false;

      if (!shouldFire) continue;
      await this.createAlertEvent({
        provider: account.provider,
        providerAccountId: account.id,
        apiKeyId: key.id,
        alertType: rule.alert_type,
        thresholdPercent: threshold,
        message: this.alertMessage(account, key, snapshot, rule.alert_type),
        data: {
          usagePercent: Number(snapshot.usage_percent),
          usedUnits: Number(snapshot.used_units),
          entitlementUnits: Number(snapshot.entitlement_units),
          remainingUnits: Number(snapshot.remaining_units),
          projectedExhaustionAt: snapshot.projected_exhaustion_at,
          projectedPeriodCostUsd: Number(snapshot.projected_period_cost_usd),
        },
        dedupeKey: `${rule.alert_type}:${key.id}:${snapshot.period_start}:${threshold ?? 'na'}`,
        notifyMasterAdmin: rule.notify_master_admin,
        notifyCompanyAdmin: rule.notify_company_admin,
      });
    }
  }

  private async createAlertEvent(input: {
    provider: ExternalProviderAccountRow['provider'];
    providerAccountId: string;
    apiKeyId: string;
    alertType: ExternalAlertEventRow['alert_type'];
    thresholdPercent: number | null;
    message: string;
    data: Record<string, unknown>;
    dedupeKey: string;
    notifyMasterAdmin?: boolean;
    notifyCompanyAdmin?: boolean;
  }): Promise<void> {
    const { data, error } = await this.supabase
      .from('external_alert_events')
      .insert({
        provider: input.provider,
        provider_account_id: input.providerAccountId,
        api_key_id: input.apiKeyId,
        alert_type: input.alertType,
        threshold_percent: input.thresholdPercent,
        message: input.message,
        data: input.data,
        dedupe_key: input.dedupeKey,
        status: 'new',
      })
      .select('*')
      .single();

    if (error && !error.message.toLowerCase().includes('duplicate')) {
      throw new Error(`Failed to create external alert event: ${error.message}`);
    }
    if (!data) return;

    await this.notifyAlertRecipients(
      data as ExternalAlertEventRow,
      input.notifyMasterAdmin ?? true,
      input.notifyCompanyAdmin ?? false,
    );
  }

  private alertMessage(
    account: ExternalProviderAccountRow,
    key: ExternalApiKeyRow,
    snapshot: ExternalUsageSnapshotRow,
    type: ExternalAlertEventRow['alert_type'],
  ): string {
    if (type === 'projected_exhaustion') {
      return `${account.provider} key ${key.key_name} is projected to exhaust its free capacity before the current period ends.`;
    }
    if (type === 'paid_cost_risk') {
      return `${account.provider} key ${key.key_name} is projected to incur paid overage this period.`;
    }
    if (type === 'trial_expiry') {
      return `${account.provider} trial capacity for ${key.key_name} is close to expiry.`;
    }
    return `${account.provider} key ${key.key_name} reached ${Number(snapshot.usage_percent).toFixed(2)}% of its configured free capacity.`;
  }

  private async notifyAlertRecipients(
    alertEvent: ExternalAlertEventRow,
    notifyMasterAdmin: boolean,
    notifyCompanyAdmin: boolean,
  ): Promise<void> {
    const { data: account } = await this.supabase
      .from('external_provider_accounts')
      .select('organization_id, account_name')
      .eq('id', alertEvent.provider_account_id)
      .maybeSingle();

    const preferredOrganizationId = (account as { organization_id?: string | null } | null)?.organization_id ?? null;
    const recipients = new Set<string>();

    if (notifyMasterAdmin) {
      const { data: platformAdmins, error } = await this.supabase
        .from('platform_admins')
        .select('user_id');
      if (error) {
        throw new Error(`Failed to load platform admins for external alert notifications: ${error.message}`);
      }
      for (const row of platformAdmins ?? []) {
        if (row.user_id) recipients.add(row.user_id);
      }
    }

    if (notifyCompanyAdmin && preferredOrganizationId) {
      const { data: companyAdminRole, error: roleError } = await this.supabase
        .from('roles')
        .select('id')
        .eq('slug', 'company_admin')
        .is('organization_id', null)
        .maybeSingle();

      if (roleError) {
        throw new Error(`Failed to resolve company_admin role for external alert notifications: ${roleError.message}`);
      }

      const roleId = (companyAdminRole as { id?: string } | null)?.id ?? null;
      if (roleId) {
        const { data: companyAdmins, error: membershipError } = await this.supabase
          .from('memberships')
          .select('user_id')
          .eq('organization_id', preferredOrganizationId)
          .eq('role_id', roleId)
          .eq('status', 'active');

        if (membershipError) {
          throw new Error(`Failed to load company admins for external alert notifications: ${membershipError.message}`);
        }

        for (const row of companyAdmins ?? []) {
          if (row.user_id) recipients.add(row.user_id);
        }
      }
    }

    for (const userId of recipients) {
      const organizationId = await this.resolveNotificationOrganizationId(userId, preferredOrganizationId);
      if (!organizationId) continue;

      await this.supabase.from('notifications').insert({
        organization_id: organizationId,
        user_id: userId,
        type: 'general',
        status: 'unread',
        data: toJson({
          kind: 'external_provider_alert',
          alertEventId: alertEvent.id,
          provider: alertEvent.provider,
          alertType: alertEvent.alert_type,
          message: alertEvent.message,
          payload: alertEvent.data,
        }),
      });
    }
  }

  private async resolveNotificationOrganizationId(
    userId: string,
    preferredOrganizationId: string | null,
  ): Promise<string | null> {
    if (preferredOrganizationId) return preferredOrganizationId;

    const { data, error } = await this.supabase
      .from('memberships')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to resolve notification organization for ${userId}: ${error.message}`);
    }

    return (data as { organization_id?: string | null } | null)?.organization_id ?? null;
  }
}
