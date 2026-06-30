import { Inject, Injectable } from '@nestjs/common';
import type {
  ExternalCostAdjustmentAdminDto,
  ExternalCostRuleAdminDto,
  ExternalCostSimulatorInput,
  ExternalCostSimulatorResult,
  ExternalEndpointCatalogAdminDto,
  ExternalOptionMultiplierAdminDto,
  ExternalProvider,
  ExternalProviderAccountAdminDto,
  ExternalProviderAlertEventAdminDto,
  ExternalProviderAlertRuleAdminDto,
  ExternalProviderApiKeyAdminDto,
  ExternalProviderHealthCheckAdminDto,
  ExternalProviderPlanProfileAdminDto,
  ExternalProviderReconciliationAdminDto,
  ExternalProviderRouteAdminDto,
  ExternalProviderTaskType,
  ExternalProviderTestRunAdminDto,
  ExternalProviderUsageAdminSummary,
  ExternalProviderUsageEventAdminDto,
  ExternalProviderUsageForecastAdminSummary,
  ExternalProviderUsageSnapshotAdminDto,
} from '@radar/contracts';
import { encryptSecret, type AppConfig, ValidationError } from '@radar/core';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { APP_CONFIG } from '../../config/app-config.module';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AuditService } from '../audit/audit.service';
import { ExternalCostCalculatorService } from './external-cost-calculator.service';
import { ExternalProviderIntelligenceService } from './external-provider-intelligence.service';
import { ExternalProviderOrchestratorService } from './external-provider-orchestrator.service';

type ExternalProviderAccountRow = Database['public']['Tables']['external_provider_accounts']['Row'];
type ExternalProviderAccountInsert = Database['public']['Tables']['external_provider_accounts']['Insert'];
type ExternalProviderAccountUpdate = Database['public']['Tables']['external_provider_accounts']['Update'];
type ExternalApiKeyRow = Database['public']['Tables']['external_api_keys']['Row'];
type ExternalApiKeyInsert = Database['public']['Tables']['external_api_keys']['Insert'];
type ExternalApiKeyUpdate = Database['public']['Tables']['external_api_keys']['Update'];
type ExternalProviderRouteRow = Database['public']['Tables']['external_provider_routes']['Row'];
type ExternalProviderRouteInsert = Database['public']['Tables']['external_provider_routes']['Insert'];
type ExternalProviderRouteUpdate = Database['public']['Tables']['external_provider_routes']['Update'];
type ExternalProviderPlanProfileRow =
  Database['public']['Tables']['external_provider_plan_profiles']['Row'];
type ExternalProviderPlanProfileInsert =
  Database['public']['Tables']['external_provider_plan_profiles']['Insert'];
type ExternalProviderPlanProfileUpdate =
  Database['public']['Tables']['external_provider_plan_profiles']['Update'];
type ExternalProviderHealthCheckRow =
  Database['public']['Tables']['external_provider_health_checks']['Row'];
type ExternalUsageSnapshotRow =
  Database['public']['Tables']['external_usage_snapshots']['Row'];
type ExternalCostRuleRow = Database['public']['Tables']['external_cost_rules']['Row'];
type ExternalOptionCostMultiplierRow = Database['public']['Tables']['external_option_cost_multipliers']['Row'];
type ExternalEndpointCatalogRow = Database['public']['Tables']['external_endpoint_catalog']['Row'];
type ExternalCostAdjustmentRow = Database['public']['Tables']['external_cost_adjustments']['Row'];

// Input types for new P10-14 CRUD operations
interface CreateCostRuleInput {
  provider: string;
  providerAccountId?: string | null;
  planProfileId?: string | null;
  ruleName: string;
  ruleScope: string;
  taskType?: string | null;
  endpointKey?: string | null;
  datasetKey?: string | null;
  actorKey?: string | null;
  unitType: string;
  billingEvent?: string | null;
  baseUnits?: number | null;
  unitsPerRequest?: number | null;
  unitsPerRecord?: number | null;
  unitsPerSuccessfulRecord?: number | null;
  unitsPerFailedRequest?: number | null;
  unitsPerPage?: number | null;
  unitsPerSearch?: number | null;
  unitsPerResult?: number | null;
  unitsPerBrowserMinute?: number | null;
  unitsPerMb?: number | null;
  unitPriceUsd?: number | null;
  minimumUnits?: number | null;
  maximumUnits?: number | null;
  freeTierEligible?: boolean;
  priority?: number | null;
  formulaJson?: unknown;
  conditionsJson?: unknown;
  isActive?: boolean;
}

interface UpsertOptionMultiplierInput {
  provider: string;
  costRuleId?: string | null;
  optionKey: string;
  optionValue?: string | null;
  multiplier?: number | null;
  additionalUnits?: number | null;
  additionalCostUsd?: number | null;
  appliesToTaskTypes?: string[];
  conditionsJson?: unknown;
  isActive?: boolean;
}

interface UpsertEndpointCatalogInput {
  provider: string;
  endpointKey: string;
  displayName: string;
  taskTypes?: string[];
  datasetKey?: string | null;
  actorKey?: string | null;
  defaultUnitType?: string | null;
  defaultCostRuleId?: string | null;
  supportsTestFlow?: boolean;
  testPayloadJson?: unknown;
  notes?: string | null;
  isActive?: boolean;
}

interface CreateCostAdjustmentInput {
  usageEventId?: string | null;
  provider: string;
  providerAccountId?: string | null;
  apiKeyId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  adjustmentType: string;
  unitDelta?: number | null;
  costDeltaUsd?: number | null;
  reason: string;
}

interface CreatePlanInput {
  provider: string;
  planName: string;
  planType: string;
  unitType: string;
  freeEntitlementAmount?: number | null;
  includedUnits?: number | null;
  renewalInterval: string;
  renewalTimezone?: string | null;
  renewalAnchorDay?: string | null;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  overageEnabled?: boolean;
  overageUnitPrice?: number | null;
  currency?: string | null;
  costRules?: unknown;
  providerDashboardUrl?: string | null;
  testEnabled?: boolean;
  testTaskType?: string | null;
  testPayloadJson?: unknown;
  testConsumesCredits?: boolean;
  expectedResponseShapeJson?: unknown;
  notes?: string | null;
  isActive?: boolean;
}

interface UpdatePlanInput extends Partial<CreatePlanInput> {}

interface CreateAccountInput {
  organizationId?: string | null;
  provider: string;
  accountName: string;
  accountType: string;
  billingOwner?: string | null;
  status?: string;
  planProfileId?: string | null;
  allowedOrganizationIds?: string[];
  weeklyBudget?: number | null;
  monthlyBudget?: number | null;
  totalBudget?: number | null;
  rateLimitRpm?: number | null;
  rateLimitTpm?: number | null;
  baseUrl?: string | null;
  notes?: string | null;
}

interface UpdateAccountInput extends Partial<CreateAccountInput> {}

interface CreateKeyInput {
  providerAccountId: string;
  apiKey: string;
  keyName: string;
  environment?: string;
  status?: string;
  allowedTaskTypes?: string[];
  allowedOrganizationIds?: string[];
  priority?: number | null;
  dailyRequestLimit?: number | null;
  weeklyRequestLimit?: number | null;
  monthlyRequestLimit?: number | null;
  dailyCreditLimit?: number | null;
  weeklyCreditLimit?: number | null;
  monthlyCreditLimit?: number | null;
  dailyRecordLimit?: number | null;
  weeklyRecordLimit?: number | null;
  monthlyRecordLimit?: number | null;
  dailyCostLimit?: number | null;
  weeklyCostLimit?: number | null;
  monthlyCostLimit?: number | null;
}

interface UpdateKeyInput extends Partial<Omit<CreateKeyInput, 'providerAccountId' | 'apiKey'>> {}

interface CreateRouteInput {
  taskType: string;
  primaryProvider: string;
  fallbackProvider?: string | null;
  fallback2Provider?: string | null;
  fallback3Provider?: string | null;
  allowManualFallback?: boolean;
  requiresBrowser?: boolean;
  requiresJson?: boolean;
  timeoutMs?: number | null;
  maxAttempts?: number;
  isActive?: boolean;
  notes?: string | null;
}

interface UpdateRouteInput extends Partial<CreateRouteInput> {
  primaryProvider: string;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  return asNumber(value, 0);
}

function asNullableInteger(value: unknown): number | null {
  const parsed = asNullableNumber(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? {})) as Json;
}

function maskSecretPreview(secret: string): string {
  const suffix = secret.slice(-4);
  return suffix ? `••••${suffix}` : '••••';
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

function mapAccount(
  row: ExternalProviderAccountRow,
  planProfile: ExternalProviderPlanProfileRow | null,
  latestSnapshot: ExternalProviderUsageSnapshotAdminDto | null,
): ExternalProviderAccountAdminDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider,
    accountName: row.account_name,
    accountType: row.account_type,
    billingOwner: row.billing_owner,
    status: row.status,
    planProfileId: row.plan_profile_id,
    planProfileName: planProfile?.plan_name ?? null,
    allowedOrganizationIds: row.allowed_organization_ids ?? [],
    weeklyBudget: row.weekly_budget == null ? null : Number(row.weekly_budget),
    monthlyBudget: row.monthly_budget == null ? null : Number(row.monthly_budget),
    totalBudget: row.total_budget == null ? null : Number(row.total_budget),
    weeklyUsage: Number(row.weekly_usage ?? 0),
    monthlyUsage: Number(row.monthly_usage ?? 0),
    totalUsage: Number(row.total_usage ?? 0),
    rateLimitRpm: row.rate_limit_rpm,
    rateLimitTpm: row.rate_limit_tpm,
    baseUrl: row.base_url,
    notes: row.notes,
    latestSnapshot,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapKey(
  row: ExternalApiKeyRow,
  latestSnapshot: ExternalProviderUsageSnapshotAdminDto | null,
): ExternalProviderApiKeyAdminDto {
  return {
    id: row.id,
    providerAccountId: row.provider_account_id,
    provider: row.provider,
    keyName: row.key_name,
    maskedKeyPreview: row.masked_key_preview,
    status: row.status,
    environment: row.environment,
    allowedTaskTypes: row.allowed_task_types ?? [],
    allowedOrganizationIds: row.allowed_organization_ids ?? [],
    priority: row.priority,
    dailyRequestLimit: row.daily_request_limit,
    weeklyRequestLimit: row.weekly_request_limit,
    monthlyRequestLimit: row.monthly_request_limit,
    dailyCreditLimit: row.daily_credit_limit == null ? null : Number(row.daily_credit_limit),
    weeklyCreditLimit: row.weekly_credit_limit == null ? null : Number(row.weekly_credit_limit),
    monthlyCreditLimit: row.monthly_credit_limit == null ? null : Number(row.monthly_credit_limit),
    dailyRecordLimit: row.daily_record_limit,
    weeklyRecordLimit: row.weekly_record_limit,
    monthlyRecordLimit: row.monthly_record_limit,
    dailyCostLimit: row.daily_cost_limit == null ? null : Number(row.daily_cost_limit),
    weeklyCostLimit: row.weekly_cost_limit == null ? null : Number(row.weekly_cost_limit),
    monthlyCostLimit: row.monthly_cost_limit == null ? null : Number(row.monthly_cost_limit),
    requestsUsedToday: row.requests_used_today,
    requestsUsedWeek: row.requests_used_week,
    requestsUsedMonth: row.requests_used_month,
    unitsUsedToday: Number(row.units_used_today ?? 0),
    unitsUsedWeek: Number(row.units_used_week ?? 0),
    unitsUsedMonth: Number(row.units_used_month ?? 0),
    recordsUsedToday: row.records_used_today,
    recordsUsedWeek: row.records_used_week,
    recordsUsedMonth: row.records_used_month,
    creditsUsedToday: Number(row.credits_used_today ?? 0),
    creditsUsedWeek: Number(row.credits_used_week ?? 0),
    creditsUsedMonth: Number(row.credits_used_month ?? 0),
    costUsedToday: Number(row.cost_used_today ?? 0),
    costUsedWeek: Number(row.cost_used_week ?? 0),
    costUsedMonth: Number(row.cost_used_month ?? 0),
    resetDailyAt: row.reset_daily_at,
    resetWeeklyAt: row.reset_weekly_at,
    resetMonthlyAt: row.reset_monthly_at,
    reservedRequestsActive: row.reserved_requests_active,
    reservedRecordsActive: row.reserved_records_active,
    reservedCreditsActive: Number(row.reserved_credits_active ?? 0),
    reservedUnitsActive: Number(row.reserved_units_active ?? 0),
    reservedCostActive: Number(row.reserved_cost_active ?? 0),
    latestSnapshot,
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
    cooldownUntil: row.cooldown_until,
    revokedAt: row.revoked_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRoute(row: ExternalProviderRouteRow): ExternalProviderRouteAdminDto {
  return {
    id: row.id,
    taskType: row.task_type,
    primaryProvider: row.primary_provider,
    fallbackProvider: row.fallback_provider,
    fallback2Provider: row.fallback_2_provider,
    fallback3Provider: row.fallback_3_provider,
    allowManualFallback: row.allow_manual_fallback,
    requiresBrowser: row.requires_browser,
    requiresJson: row.requires_json,
    timeoutMs: row.timeout_ms,
    maxAttempts: row.max_attempts,
    isActive: row.is_active,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class ExternalProviderAdminService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly intelligence: ExternalProviderIntelligenceService,
    private readonly orchestrator: ExternalProviderOrchestratorService,
    private readonly calculator: ExternalCostCalculatorService,
  ) {}

  async listPlans(): Promise<{ items: ExternalProviderPlanProfileAdminDto[] }> {
    return this.intelligence.listPlanProfiles();
  }

  async createPlan(
    auditOrganizationId: string,
    actorUserId: string,
    input: CreatePlanInput,
  ): Promise<{ success: boolean; id: string }> {
    const planName = asString(input.planName);
    if (!planName) throw new ValidationError('planName is required');

    const payload: ExternalProviderPlanProfileInsert = {
      provider: input.provider as ExternalProvider,
      plan_name: planName,
      plan_type: input.planType as ExternalProviderPlanProfileRow['plan_type'],
      unit_type: input.unitType as ExternalProviderPlanProfileRow['unit_type'],
      free_entitlement_amount: asNullableNumber(input.freeEntitlementAmount) ?? 0,
      included_units: asNullableNumber(input.includedUnits) ?? 0,
      renewal_interval: input.renewalInterval as ExternalProviderPlanProfileRow['renewal_interval'],
      renewal_timezone: asString(input.renewalTimezone) ?? 'UTC',
      renewal_anchor_day: asString(input.renewalAnchorDay),
      trial_starts_at: input.trialStartsAt ?? null,
      trial_ends_at: input.trialEndsAt ?? null,
      overage_enabled: input.overageEnabled ?? false,
      overage_unit_price: asNullableNumber(input.overageUnitPrice) ?? 0,
      currency: asString(input.currency) ?? 'USD',
      cost_rules: toJson(input.costRules ?? {}),
      provider_dashboard_url: asString(input.providerDashboardUrl),
      test_enabled: input.testEnabled ?? false,
      test_task_type: (input.testTaskType as ExternalProviderTaskType | null | undefined) ?? null,
      test_payload_json: toJson(input.testPayloadJson ?? {}),
      test_consumes_credits: input.testConsumesCredits ?? false,
      expected_response_shape_json: toJson(input.expectedResponseShapeJson ?? {}),
      notes: asString(input.notes),
      is_active: input.isActive ?? true,
    };

    const { data, error } = await this.supabase
      .from('external_provider_plan_profiles')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create external provider plan profile: ${error?.message ?? 'unknown'}`);
    }

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.plan.created',
      entityType: 'external_provider_plan_profile',
      entityId: data.id,
      after: mapPlan(data as ExternalProviderPlanProfileRow),
    });

    return { success: true, id: data.id };
  }

  async updatePlan(
    auditOrganizationId: string,
    actorUserId: string,
    planId: string,
    input: UpdatePlanInput,
  ): Promise<{ success: boolean }> {
    const before = await this.loadPlan(planId);
    const patch: ExternalProviderPlanProfileUpdate = {
      provider: (input.provider as ExternalProvider | undefined) ?? before.provider,
      plan_name: asString(input.planName) ?? before.plan_name,
      plan_type: (input.planType as ExternalProviderPlanProfileRow['plan_type'] | undefined) ?? before.plan_type,
      unit_type: (input.unitType as ExternalProviderPlanProfileRow['unit_type'] | undefined) ?? before.unit_type,
      free_entitlement_amount:
        input.freeEntitlementAmount === undefined
          ? before.free_entitlement_amount
          : asNullableNumber(input.freeEntitlementAmount) ?? 0,
      included_units:
        input.includedUnits === undefined ? before.included_units : asNullableNumber(input.includedUnits) ?? 0,
      renewal_interval:
        (input.renewalInterval as ExternalProviderPlanProfileRow['renewal_interval'] | undefined) ??
        before.renewal_interval,
      renewal_timezone: input.renewalTimezone === undefined ? before.renewal_timezone : asString(input.renewalTimezone) ?? 'UTC',
      renewal_anchor_day:
        input.renewalAnchorDay === undefined ? before.renewal_anchor_day : asString(input.renewalAnchorDay),
      trial_starts_at: input.trialStartsAt === undefined ? before.trial_starts_at : input.trialStartsAt,
      trial_ends_at: input.trialEndsAt === undefined ? before.trial_ends_at : input.trialEndsAt,
      overage_enabled: input.overageEnabled ?? before.overage_enabled,
      overage_unit_price:
        input.overageUnitPrice === undefined
          ? before.overage_unit_price
          : asNullableNumber(input.overageUnitPrice) ?? 0,
      currency: input.currency === undefined ? before.currency : asString(input.currency) ?? 'USD',
      cost_rules: input.costRules === undefined ? before.cost_rules : toJson(input.costRules),
      provider_dashboard_url:
        input.providerDashboardUrl === undefined
          ? before.provider_dashboard_url
          : asString(input.providerDashboardUrl),
      test_enabled: input.testEnabled ?? before.test_enabled,
      test_task_type:
        input.testTaskType === undefined
          ? before.test_task_type
          : (input.testTaskType as ExternalProviderTaskType | null),
      test_payload_json:
        input.testPayloadJson === undefined ? before.test_payload_json : toJson(input.testPayloadJson),
      test_consumes_credits: input.testConsumesCredits ?? before.test_consumes_credits,
      expected_response_shape_json:
        input.expectedResponseShapeJson === undefined
          ? before.expected_response_shape_json
          : toJson(input.expectedResponseShapeJson),
      notes: input.notes === undefined ? before.notes : asString(input.notes),
      is_active: input.isActive ?? before.is_active,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('external_provider_plan_profiles')
      .update(patch)
      .eq('id', planId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update external provider plan ${planId}: ${error?.message ?? 'unknown'}`);
    }

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.plan.updated',
      entityType: 'external_provider_plan_profile',
      entityId: planId,
      before: mapPlan(before),
      after: mapPlan(data as ExternalProviderPlanProfileRow),
    });

    return { success: true };
  }

  async listAccounts(): Promise<{ items: ExternalProviderAccountAdminDto[] }> {
    const { data, error } = await this.supabase
      .from('external_provider_accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to load external provider accounts: ${error.message}`);
    const rows = (data ?? []) as ExternalProviderAccountRow[];
    const planMap = await this.loadPlanMap(rows.map((row) => row.plan_profile_id));
    const snapshotMap = await this.loadLatestAccountSnapshots(rows.map((row) => row.id));
    return {
      items: rows.map((row) => mapAccount(row, planMap.get(row.plan_profile_id ?? '') ?? null, snapshotMap.get(row.id) ?? null)),
    };
  }

  async createAccount(
    auditOrganizationId: string,
    actorUserId: string,
    input: CreateAccountInput,
  ): Promise<{ success: boolean; id: string }> {
    const accountName = asString(input.accountName);
    if (!accountName) throw new ValidationError('accountName is required');

    const payload: ExternalProviderAccountInsert = {
      organization_id: input.organizationId ?? null,
      provider: input.provider as ExternalProvider,
      account_name: accountName,
      account_type: input.accountType as ExternalProviderAccountRow['account_type'],
      billing_owner: asString(input.billingOwner),
      status: (input.status as ExternalProviderAccountRow['status'] | undefined) ?? 'active',
      plan_profile_id: asString(input.planProfileId),
      allowed_organization_ids: asStringArray(input.allowedOrganizationIds),
      weekly_budget: asNullableNumber(input.weeklyBudget),
      monthly_budget: asNullableNumber(input.monthlyBudget),
      total_budget: asNullableNumber(input.totalBudget),
      rate_limit_rpm: asNullableInteger(input.rateLimitRpm),
      rate_limit_tpm: asNullableInteger(input.rateLimitTpm),
      base_url: asString(input.baseUrl),
      notes: asString(input.notes),
      created_by: actorUserId,
    };

    const { data, error } = await this.supabase
      .from('external_provider_accounts')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create external provider account: ${error?.message ?? 'unknown'}`);
    }

    const planProfile = data.plan_profile_id ? await this.loadPlan(data.plan_profile_id) : null;
    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.account.created',
      entityType: 'external_provider_account',
      entityId: data.id,
      after: mapAccount(data as ExternalProviderAccountRow, planProfile, null),
    });

    return { success: true, id: data.id };
  }

  async updateAccount(
    auditOrganizationId: string,
    actorUserId: string,
    accountId: string,
    input: UpdateAccountInput,
  ): Promise<{ success: boolean }> {
    const before = await this.loadAccount(accountId);
    const patch: ExternalProviderAccountUpdate = {
      organization_id: input.organizationId === undefined ? before.organization_id : input.organizationId,
      provider: (input.provider as ExternalProvider | undefined) ?? before.provider,
      account_name: asString(input.accountName) ?? before.account_name,
      account_type:
        (input.accountType as ExternalProviderAccountRow['account_type'] | undefined) ?? before.account_type,
      billing_owner: input.billingOwner === undefined ? before.billing_owner : asString(input.billingOwner),
      status: (input.status as ExternalProviderAccountRow['status'] | undefined) ?? before.status,
      plan_profile_id: input.planProfileId === undefined ? before.plan_profile_id : asString(input.planProfileId),
      allowed_organization_ids:
        input.allowedOrganizationIds === undefined ? before.allowed_organization_ids : asStringArray(input.allowedOrganizationIds),
      weekly_budget:
        input.weeklyBudget === undefined ? before.weekly_budget : asNullableNumber(input.weeklyBudget),
      monthly_budget:
        input.monthlyBudget === undefined ? before.monthly_budget : asNullableNumber(input.monthlyBudget),
      total_budget:
        input.totalBudget === undefined ? before.total_budget : asNullableNumber(input.totalBudget),
      rate_limit_rpm:
        input.rateLimitRpm === undefined ? before.rate_limit_rpm : asNullableInteger(input.rateLimitRpm),
      rate_limit_tpm:
        input.rateLimitTpm === undefined ? before.rate_limit_tpm : asNullableInteger(input.rateLimitTpm),
      base_url: input.baseUrl === undefined ? before.base_url : asString(input.baseUrl),
      notes: input.notes === undefined ? before.notes : asString(input.notes),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('external_provider_accounts')
      .update(patch)
      .eq('id', accountId)
      .select('*')
      .single();

    if (error || !data) throw new Error(`Failed to update external provider account ${accountId}: ${error?.message ?? 'unknown'}`);

    const [beforePlan, afterPlan] = await Promise.all([
      before.plan_profile_id ? this.loadPlan(before.plan_profile_id) : Promise.resolve(null),
      data.plan_profile_id ? this.loadPlan(data.plan_profile_id) : Promise.resolve(null),
    ]);

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.account.updated',
      entityType: 'external_provider_account',
      entityId: accountId,
      before: mapAccount(before, beforePlan, null),
      after: mapAccount(data as ExternalProviderAccountRow, afterPlan, null),
    });

    return { success: true };
  }

  async deleteAccount(
    auditOrganizationId: string,
    actorUserId: string,
    accountId: string,
  ): Promise<{ success: boolean }> {
    const before = await this.loadAccount(accountId);
    const planProfile = before.plan_profile_id ? await this.loadPlan(before.plan_profile_id) : null;
    const { error } = await this.supabase.from('external_provider_accounts').delete().eq('id', accountId);
    if (error) throw new Error(`Failed to delete external provider account ${accountId}: ${error.message}`);

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.account.deleted',
      entityType: 'external_provider_account',
      entityId: accountId,
      before: mapAccount(before, planProfile, null),
    });

    return { success: true };
  }

  async listKeys(): Promise<{ items: ExternalProviderApiKeyAdminDto[] }> {
    const { data, error } = await this.supabase
      .from('external_api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to load external provider keys: ${error.message}`);
    const rows = (data ?? []) as ExternalApiKeyRow[];
    const snapshotMap = await this.loadLatestKeySnapshots(rows.map((row) => row.id));
    return { items: rows.map((row) => mapKey(row, snapshotMap.get(row.id) ?? null)) };
  }

  async createKey(
    auditOrganizationId: string,
    actorUserId: string,
    input: CreateKeyInput,
  ): Promise<{ success: boolean; id: string }> {
    if (!this.config.ENCRYPTION_KEY) {
      throw new ValidationError('ENCRYPTION_KEY is required before external provider keys can be stored');
    }

    const keyName = asString(input.keyName);
    if (!keyName) throw new ValidationError('keyName is required');

    const account = await this.loadAccount(input.providerAccountId);
    const payload: ExternalApiKeyInsert = {
      provider_account_id: input.providerAccountId,
      provider: account.provider,
      key_name: keyName,
      encrypted_api_key: encryptSecret(input.apiKey, this.config.ENCRYPTION_KEY),
      masked_key_preview: maskSecretPreview(input.apiKey),
      status: (input.status as ExternalApiKeyRow['status'] | undefined) ?? 'active',
      environment: asString(input.environment) ?? 'production',
      allowed_task_types: asStringArray(input.allowedTaskTypes) as ExternalProviderTaskType[],
      allowed_organization_ids: asStringArray(input.allowedOrganizationIds),
      priority: asNullableInteger(input.priority) ?? 100,
      daily_request_limit: asNullableInteger(input.dailyRequestLimit),
      weekly_request_limit: asNullableInteger(input.weeklyRequestLimit),
      monthly_request_limit: asNullableInteger(input.monthlyRequestLimit),
      daily_credit_limit: asNullableNumber(input.dailyCreditLimit),
      weekly_credit_limit: asNullableNumber(input.weeklyCreditLimit),
      monthly_credit_limit: asNullableNumber(input.monthlyCreditLimit),
      daily_record_limit: asNullableInteger(input.dailyRecordLimit),
      weekly_record_limit: asNullableInteger(input.weeklyRecordLimit),
      monthly_record_limit: asNullableInteger(input.monthlyRecordLimit),
      daily_cost_limit: asNullableNumber(input.dailyCostLimit),
      weekly_cost_limit: asNullableNumber(input.weeklyCostLimit),
      monthly_cost_limit: asNullableNumber(input.monthlyCostLimit),
      created_by: actorUserId,
    };

    const { data, error } = await this.supabase
      .from('external_api_keys')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create external provider key: ${error?.message ?? 'unknown'}`);
    }

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.key.created',
      entityType: 'external_api_key',
      entityId: data.id,
      after: { ...mapKey(data as ExternalApiKeyRow, null), apiKeyStored: true },
    });

    return { success: true, id: data.id };
  }

  async updateKey(
    auditOrganizationId: string,
    actorUserId: string,
    keyId: string,
    input: UpdateKeyInput,
  ): Promise<{ success: boolean }> {
    const before = await this.loadKey(keyId);
    const now = new Date().toISOString();
    const nextStatus = (input.status as ExternalApiKeyRow['status'] | undefined) ?? before.status;
    const patch: ExternalApiKeyUpdate = {
      key_name: asString(input.keyName) ?? before.key_name,
      status: nextStatus,
      environment: asString(input.environment) ?? before.environment,
      allowed_task_types:
        input.allowedTaskTypes === undefined
          ? before.allowed_task_types
          : (asStringArray(input.allowedTaskTypes) as ExternalProviderTaskType[]),
      allowed_organization_ids:
        input.allowedOrganizationIds === undefined ? before.allowed_organization_ids : asStringArray(input.allowedOrganizationIds),
      priority: input.priority === undefined ? before.priority : asNullableInteger(input.priority) ?? 100,
      daily_request_limit:
        input.dailyRequestLimit === undefined ? before.daily_request_limit : asNullableInteger(input.dailyRequestLimit),
      weekly_request_limit:
        input.weeklyRequestLimit === undefined ? before.weekly_request_limit : asNullableInteger(input.weeklyRequestLimit),
      monthly_request_limit:
        input.monthlyRequestLimit === undefined ? before.monthly_request_limit : asNullableInteger(input.monthlyRequestLimit),
      daily_credit_limit:
        input.dailyCreditLimit === undefined ? before.daily_credit_limit : asNullableNumber(input.dailyCreditLimit),
      weekly_credit_limit:
        input.weeklyCreditLimit === undefined ? before.weekly_credit_limit : asNullableNumber(input.weeklyCreditLimit),
      monthly_credit_limit:
        input.monthlyCreditLimit === undefined ? before.monthly_credit_limit : asNullableNumber(input.monthlyCreditLimit),
      daily_record_limit:
        input.dailyRecordLimit === undefined ? before.daily_record_limit : asNullableInteger(input.dailyRecordLimit),
      weekly_record_limit:
        input.weeklyRecordLimit === undefined ? before.weekly_record_limit : asNullableInteger(input.weeklyRecordLimit),
      monthly_record_limit:
        input.monthlyRecordLimit === undefined ? before.monthly_record_limit : asNullableInteger(input.monthlyRecordLimit),
      daily_cost_limit:
        input.dailyCostLimit === undefined ? before.daily_cost_limit : asNullableNumber(input.dailyCostLimit),
      weekly_cost_limit:
        input.weeklyCostLimit === undefined ? before.weekly_cost_limit : asNullableNumber(input.weeklyCostLimit),
      monthly_cost_limit:
        input.monthlyCostLimit === undefined ? before.monthly_cost_limit : asNullableNumber(input.monthlyCostLimit),
      revoked_at:
        nextStatus === 'revoked' ? before.revoked_at ?? now : input.status ? null : before.revoked_at,
      updated_at: now,
    };

    const { data, error } = await this.supabase
      .from('external_api_keys')
      .update(patch)
      .eq('id', keyId)
      .select('*')
      .single();

    if (error || !data) throw new Error(`Failed to update external provider key ${keyId}: ${error?.message ?? 'unknown'}`);

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.key.updated',
      entityType: 'external_api_key',
      entityId: keyId,
      before: mapKey(before, null),
      after: mapKey(data as ExternalApiKeyRow, null),
    });

    return { success: true };
  }

  async deleteKey(
    auditOrganizationId: string,
    actorUserId: string,
    keyId: string,
  ): Promise<{ success: boolean }> {
    const before = await this.loadKey(keyId);
    const { error } = await this.supabase.from('external_api_keys').delete().eq('id', keyId);
    if (error) throw new Error(`Failed to delete external provider key ${keyId}: ${error.message}`);

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.key.deleted',
      entityType: 'external_api_key',
      entityId: keyId,
      before: mapKey(before, null),
    });

    return { success: true };
  }

  async testKey(
    auditOrganizationId: string,
    actorUserId: string,
    apiKeyId: string,
    input: { taskType?: string; testPayload?: unknown; timeoutMs?: number },
  ): Promise<{ success: boolean; result: ExternalProviderTestRunAdminDto }> {
    const result = await this.orchestrator.testKey({
      organizationId: auditOrganizationId,
      apiKeyId,
      taskType: (input.taskType as ExternalProviderTaskType | undefined) ?? undefined,
      testPayload: input.testPayload,
      timeoutMs: asNullableInteger(input.timeoutMs) ?? undefined,
      userId: actorUserId,
    });

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.key.tested',
      entityType: 'external_api_key',
      entityId: apiKeyId,
      after: result,
    });

    return { success: true, result };
  }

  async listRoutes(): Promise<{ items: ExternalProviderRouteAdminDto[] }> {
    const { data, error } = await this.supabase
      .from('external_provider_routes')
      .select('*')
      .order('task_type', { ascending: true });

    if (error) throw new Error(`Failed to load external provider routes: ${error.message}`);
    return { items: ((data ?? []) as ExternalProviderRouteRow[]).map(mapRoute) };
  }

  async createRoute(
    auditOrganizationId: string,
    actorUserId: string,
    input: CreateRouteInput,
  ): Promise<{ success: boolean; id: string }> {
    const taskType = asString(input.taskType);
    if (!taskType) throw new ValidationError('taskType is required');

    const payload: ExternalProviderRouteInsert = {
      task_type: taskType as ExternalProviderTaskType,
      primary_provider: input.primaryProvider as ExternalProvider,
      fallback_provider: (input.fallbackProvider as ExternalProvider | null | undefined) ?? null,
      fallback_2_provider: (input.fallback2Provider as ExternalProvider | null | undefined) ?? null,
      fallback_3_provider: (input.fallback3Provider as ExternalProvider | null | undefined) ?? null,
      allow_manual_fallback: input.allowManualFallback ?? false,
      requires_browser: input.requiresBrowser ?? false,
      requires_json: input.requiresJson ?? true,
      timeout_ms: asNullableInteger(input.timeoutMs),
      max_attempts: asNullableInteger(input.maxAttempts) ?? 1,
      is_active: input.isActive ?? true,
      notes: asString(input.notes),
    };

    const { data, error } = await this.supabase
      .from('external_provider_routes')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create external provider route: ${error?.message ?? 'unknown'}`);
    }

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.route.created',
      entityType: 'external_provider_route',
      entityId: data.id,
      after: mapRoute(data as ExternalProviderRouteRow),
    });

    return { success: true, id: data.id };
  }

  async updateRoute(
    auditOrganizationId: string,
    actorUserId: string,
    taskType: string,
    input: UpdateRouteInput,
  ): Promise<{ success: boolean }> {
    const before = await this.loadRoute(taskType);
    const patch: ExternalProviderRouteUpdate = {
      primary_provider: input.primaryProvider as ExternalProvider,
      fallback_provider:
        input.fallbackProvider === undefined ? before.fallback_provider : (input.fallbackProvider as ExternalProvider | null),
      fallback_2_provider:
        input.fallback2Provider === undefined ? before.fallback_2_provider : (input.fallback2Provider as ExternalProvider | null),
      fallback_3_provider:
        input.fallback3Provider === undefined ? before.fallback_3_provider : (input.fallback3Provider as ExternalProvider | null),
      allow_manual_fallback: input.allowManualFallback ?? before.allow_manual_fallback,
      requires_browser: input.requiresBrowser ?? before.requires_browser,
      requires_json: input.requiresJson ?? before.requires_json,
      timeout_ms: input.timeoutMs === undefined ? before.timeout_ms : asNullableInteger(input.timeoutMs),
      max_attempts: input.maxAttempts ?? before.max_attempts,
      is_active: input.isActive ?? before.is_active,
      notes: input.notes === undefined ? before.notes : asString(input.notes),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('external_provider_routes')
      .update(patch)
      .eq('task_type', taskType)
      .select('*')
      .single();

    if (error || !data) throw new Error(`Failed to update external provider route ${taskType}: ${error?.message ?? 'unknown'}`);

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.route.updated',
      entityType: 'external_provider_route',
      entityId: before.id,
      before: mapRoute(before),
      after: mapRoute(data as ExternalProviderRouteRow),
    });

    return { success: true };
  }

  async listHealth(limit = 100): Promise<{ items: ExternalProviderHealthCheckAdminDto[] }> {
    const { data, error } = await this.supabase
      .from('external_provider_health_checks')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to load external provider health checks: ${error.message}`);

    return {
      items: ((data ?? []) as ExternalProviderHealthCheckRow[]).map((row) => ({
        id: row.id,
        provider: row.provider,
        providerAccountId: row.provider_account_id,
        apiKeyId: row.api_key_id,
        status: row.status,
        latencyMs: row.latency_ms,
        checkedAt: row.checked_at,
        detail: row.detail,
      })),
    };
  }

  async getUsageSummary(
    period?: string,
    organizationId?: string,
  ): Promise<ExternalProviderUsageAdminSummary> {
    return this.intelligence.getUsageSummary(period, organizationId);
  }

  async getUsageForecast(
    period?: string,
    organizationId?: string,
  ): Promise<ExternalProviderUsageForecastAdminSummary> {
    return this.intelligence.getUsageForecast(period, organizationId);
  }

  async listUsageEvents(input: {
    period?: string;
    organizationId?: string;
    limit?: number;
  }): Promise<{ items: ExternalProviderUsageEventAdminDto[] }> {
    return this.intelligence.listUsageEvents(input);
  }

  async listSnapshots(input: {
    limit?: number;
    periodType?: 'daily' | 'weekly' | 'monthly' | 'trial' | 'custom';
  }): Promise<{ items: ExternalProviderUsageSnapshotAdminDto[] }> {
    return this.intelligence.listSnapshots(input);
  }

  async recalculateUsage(
    auditOrganizationId: string,
    actorUserId: string,
    input: { providerAccountId?: string; apiKeyId?: string },
  ): Promise<{ success: boolean; items: ExternalProviderUsageSnapshotAdminDto[] }> {
    const items = await this.intelligence.recalculateUsage(input);
    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.usage.recalculated',
      entityType: 'external_usage_snapshot',
      entityId: input.apiKeyId ?? input.providerAccountId ?? 'all',
      after: { input, count: items.length },
    });
    return { success: true, items };
  }

  async listAlerts(limit?: number): Promise<{
    rules: ExternalProviderAlertRuleAdminDto[];
    events: ExternalProviderAlertEventAdminDto[];
  }> {
    return this.intelligence.listAlerts(limit);
  }

  async acknowledgeAlert(
    auditOrganizationId: string,
    actorUserId: string,
    alertId: string,
  ): Promise<{ success: boolean }> {
    return this.intelligence.acknowledgeAlert(auditOrganizationId, actorUserId, alertId);
  }

  async listTestRuns(limit?: number): Promise<{ items: ExternalProviderTestRunAdminDto[] }> {
    return this.intelligence.listTestRuns(limit);
  }

  async listReconciliations(limit?: number): Promise<{ items: ExternalProviderReconciliationAdminDto[] }> {
    return this.intelligence.listReconciliations(limit);
  }

  async reconcileUsage(
    auditOrganizationId: string,
    actorUserId: string,
    input: {
      provider: ExternalProvider;
      providerAccountId: string | null;
      apiKeyId: string | null;
      periodStart: string;
      periodEnd: string;
      internalUsedUnits: number;
      providerReportedUnits: number | null;
      rawSummary: unknown;
      status?: ExternalProviderReconciliationAdminDto['status'];
    },
  ): Promise<{ success: boolean; id: string }> {
    const result = await this.intelligence.reconcileUsage({
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      apiKeyId: input.apiKeyId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      internalUsedUnits: input.internalUsedUnits,
      providerReportedUnits: input.providerReportedUnits,
      rawSummary: input.rawSummary,
      status: input.status,
    });

    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.usage.reconciled',
      entityType: 'external_usage_reconciliation',
      entityId: result.id,
      after: input,
    });

    return { success: true, id: result.id };
  }

  async runResetCheck(
    auditOrganizationId: string,
    actorUserId: string,
  ): Promise<{ success: boolean }> {
    await this.intelligence.runResetCheck();
    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.reset_check.run',
      entityType: 'external_provider_capacity_pool',
      entityId: 'global',
    });
    return { success: true };
  }

  async syncUsage(
    auditOrganizationId: string,
    actorUserId: string,
  ): Promise<{ success: boolean }> {
    await this.intelligence.syncUsage();
    await this.audit.recordAction({
      organizationId: auditOrganizationId,
      actorId: actorUserId,
      action: 'external_provider.usage_sync.run',
      entityType: 'external_provider_capacity_pool',
      entityId: 'global',
    });
    return { success: true };
  }

  private async loadPlanMap(planIds: Array<string | null>): Promise<Map<string, ExternalProviderPlanProfileRow>> {
    const ids = [...new Set(planIds.filter((value): value is string => typeof value === 'string' && value.length > 0))];
    if (ids.length === 0) return new Map();

    const { data, error } = await this.supabase
      .from('external_provider_plan_profiles')
      .select('*')
      .in('id', ids);

    if (error) throw new Error(`Failed to load external provider plans: ${error.message}`);
    return new Map(((data ?? []) as ExternalProviderPlanProfileRow[]).map((row) => [row.id, row] as const));
  }

  private async loadLatestAccountSnapshots(accountIds: string[]): Promise<Map<string, ExternalProviderUsageSnapshotAdminDto>> {
    const ids = [...new Set(accountIds.filter(Boolean))];
    if (ids.length === 0) return new Map();

    const { data, error } = await this.supabase
      .from('external_usage_snapshots')
      .select('*')
      .in('provider_account_id', ids)
      .order('calculated_at', { ascending: false });

    if (error) throw new Error(`Failed to load external account snapshots: ${error.message}`);

    const snapshots = new Map<string, ExternalProviderUsageSnapshotAdminDto>();
    for (const row of data ?? []) {
      if (!row.provider_account_id || snapshots.has(row.provider_account_id)) continue;
      snapshots.set(row.provider_account_id, mapSnapshot(row));
    }
    return snapshots;
  }

  private async loadLatestKeySnapshots(keyIds: string[]): Promise<Map<string, ExternalProviderUsageSnapshotAdminDto>> {
    const ids = [...new Set(keyIds.filter(Boolean))];
    if (ids.length === 0) return new Map();

    const { data, error } = await this.supabase
      .from('external_usage_snapshots')
      .select('*')
      .in('api_key_id', ids)
      .order('calculated_at', { ascending: false });

    if (error) throw new Error(`Failed to load external key snapshots: ${error.message}`);

    const snapshots = new Map<string, ExternalProviderUsageSnapshotAdminDto>();
    for (const row of data ?? []) {
      if (!row.api_key_id || snapshots.has(row.api_key_id)) continue;
      snapshots.set(row.api_key_id, mapSnapshot(row));
    }
    return snapshots;
  }

  private async loadPlan(planId: string): Promise<ExternalProviderPlanProfileRow> {
    const { data, error } = await this.supabase
      .from('external_provider_plan_profiles')
      .select('*')
      .eq('id', planId)
      .single();

    if (error || !data) throw new Error(`External provider plan ${planId} was not found`);
    return data as ExternalProviderPlanProfileRow;
  }

  private async loadAccount(accountId: string): Promise<ExternalProviderAccountRow> {
    const { data, error } = await this.supabase
      .from('external_provider_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (error || !data) throw new Error(`External provider account ${accountId} was not found`);
    return data as ExternalProviderAccountRow;
  }

  private async loadKey(keyId: string): Promise<ExternalApiKeyRow> {
    const { data, error } = await this.supabase
      .from('external_api_keys')
      .select('*')
      .eq('id', keyId)
      .single();

    if (error || !data) throw new Error(`External provider key ${keyId} was not found`);
    return data as ExternalApiKeyRow;
  }

  // ── P10-14: Cost Rules CRUD ───────────────────────────────────────────────

  async listCostRules(filter: {
    provider?: string;
    taskType?: string;
    isActive?: boolean;
  }): Promise<ExternalCostRuleAdminDto[]> {
    let query = this.supabase.from('external_cost_rules').select('*').order('priority', { ascending: true });
    if (filter.provider) query = query.eq('provider', filter.provider);
    if (filter.taskType) query = query.eq('task_type', filter.taskType);
    if (filter.isActive !== undefined) query = query.eq('is_active', filter.isActive);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list cost rules: ${error.message}`);
    return ((data ?? []) as ExternalCostRuleRow[]).map(mapCostRule);
  }

  async getCostRule(id: string): Promise<ExternalCostRuleAdminDto> {
    const { data, error } = await this.supabase.from('external_cost_rules').select('*').eq('id', id).single();
    if (error || !data) throw new Error(`Cost rule ${id} not found`);
    return mapCostRule(data as ExternalCostRuleRow);
  }

  async createCostRule(input: CreateCostRuleInput): Promise<ExternalCostRuleAdminDto> {
    const payload = buildCostRulePayload(input);
    const { data, error } = await this.supabase.from('external_cost_rules').insert(payload).select('*').single();
    if (error || !data) throw new Error(`Failed to create cost rule: ${error?.message ?? 'unknown'}`);
    return mapCostRule(data as ExternalCostRuleRow);
  }

  async updateCostRule(id: string, input: Partial<CreateCostRuleInput>): Promise<ExternalCostRuleAdminDto> {
    const payload = { ...buildCostRulePayload(input as CreateCostRuleInput), updated_at: new Date().toISOString() };
    const { data, error } = await this.supabase.from('external_cost_rules').update(payload).eq('id', id).select('*').single();
    if (error || !data) throw new Error(`Failed to update cost rule ${id}: ${error?.message ?? 'unknown'}`);
    return mapCostRule(data as ExternalCostRuleRow);
  }

  async deleteCostRule(id: string): Promise<void> {
    const { error } = await this.supabase.from('external_cost_rules').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete cost rule ${id}: ${error.message}`);
  }

  // ── P10-14: Option Multipliers CRUD ──────────────────────────────────────

  async listOptionMultipliers(filter: {
    provider?: string;
    isActive?: boolean;
  }): Promise<ExternalOptionMultiplierAdminDto[]> {
    let query = this.supabase.from('external_option_cost_multipliers').select('*').order('created_at', { ascending: false });
    if (filter.provider) query = query.eq('provider', filter.provider);
    if (filter.isActive !== undefined) query = query.eq('is_active', filter.isActive);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list option multipliers: ${error.message}`);
    return ((data ?? []) as ExternalOptionCostMultiplierRow[]).map(mapOptionMultiplier);
  }

  async upsertOptionMultiplier(input: UpsertOptionMultiplierInput): Promise<ExternalOptionMultiplierAdminDto> {
    const payload = {
      provider: input.provider as ExternalProvider,
      cost_rule_id: input.costRuleId ?? null,
      option_key: input.optionKey,
      option_value: input.optionValue ?? null,
      multiplier: asNumber(input.multiplier, 1),
      additional_units: asNumber(input.additionalUnits, 0),
      additional_cost_usd: asNumber(input.additionalCostUsd, 0),
      applies_to_task_types: asStringArray(input.appliesToTaskTypes),
      conditions_json: toJson(input.conditionsJson ?? {}),
      is_active: input.isActive ?? true,
    };
    const { data, error } = await this.supabase.from('external_option_cost_multipliers').insert(payload).select('*').single();
    if (error || !data) throw new Error(`Failed to upsert option multiplier: ${error?.message ?? 'unknown'}`);
    return mapOptionMultiplier(data as ExternalOptionCostMultiplierRow);
  }

  async deleteOptionMultiplier(id: string): Promise<void> {
    const { error } = await this.supabase.from('external_option_cost_multipliers').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete option multiplier ${id}: ${error.message}`);
  }

  // ── P10-14: Endpoint Catalog CRUD ────────────────────────────────────────

  async listEndpointCatalog(filter: {
    provider?: string;
    isActive?: boolean;
  }): Promise<ExternalEndpointCatalogAdminDto[]> {
    let query = this.supabase.from('external_endpoint_catalog').select('*').order('provider', { ascending: true });
    if (filter.provider) query = query.eq('provider', filter.provider);
    if (filter.isActive !== undefined) query = query.eq('is_active', filter.isActive);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list endpoint catalog: ${error.message}`);
    return ((data ?? []) as ExternalEndpointCatalogRow[]).map(mapEndpointCatalog);
  }

  async upsertEndpointCatalog(input: UpsertEndpointCatalogInput): Promise<ExternalEndpointCatalogAdminDto> {
    const payload = {
      provider: input.provider as ExternalProvider,
      endpoint_key: input.endpointKey,
      display_name: input.displayName,
      task_types: asStringArray(input.taskTypes),
      dataset_key: asString(input.datasetKey),
      actor_key: asString(input.actorKey),
      default_unit_type: (input.defaultUnitType as ExternalEndpointCatalogRow['default_unit_type'] | null | undefined) ?? null,
      default_cost_rule_id: asString(input.defaultCostRuleId),
      supports_test_flow: input.supportsTestFlow ?? false,
      test_payload_json: toJson(input.testPayloadJson ?? {}),
      notes: asString(input.notes),
      is_active: input.isActive ?? true,
    };
    const { data, error } = await this.supabase
      .from('external_endpoint_catalog')
      .upsert(payload, { onConflict: 'provider,endpoint_key' })
      .select('*')
      .single();
    if (error || !data) throw new Error(`Failed to upsert endpoint catalog entry: ${error?.message ?? 'unknown'}`);
    return mapEndpointCatalog(data as ExternalEndpointCatalogRow);
  }

  async deleteEndpointEntry(id: string): Promise<void> {
    const { error } = await this.supabase.from('external_endpoint_catalog').delete().eq('id', id);
    if (error) throw new Error(`Failed to delete endpoint catalog entry ${id}: ${error.message}`);
  }

  // ── P10-14: Cost Simulator ────────────────────────────────────────────────

  async runCostSimulator(input: ExternalCostSimulatorInput): Promise<ExternalCostSimulatorResult> {
    const [costRule, optionMultipliers] = await Promise.all([
      this.calculator.resolveActiveCostRule(
        input.provider,
        input.taskType,
        input.endpointKey,
        input.datasetKey,
        input.actorKey,
      ),
      this.calculator.resolveOptionMultipliers(input.provider, input.taskType, input.optionsJson),
    ]);

    // Load remaining free units if a key was supplied
    let remainingFreeUnits = 0;
    if (input.apiKeyId) {
      const { data: keyRow } = await this.supabase
        .from('external_api_keys')
        .select('units_used_today,daily_credit_limit')
        .eq('id', input.apiKeyId)
        .single();
      if (keyRow) {
        const limit = asNullableNumber((keyRow as Record<string, unknown>)['daily_credit_limit']);
        const used = asNumber((keyRow as Record<string, unknown>)['units_used_today'], 0);
        remainingFreeUnits = limit != null ? Math.max(limit - used, 0) : 0;
      }
    }

    const estimate = await this.calculator.calculatePreCallEstimate({
      provider: input.provider,
      taskType: input.taskType,
      endpointKey: input.endpointKey,
      datasetKey: input.datasetKey,
      actorKey: input.actorKey,
      expectedRequests: input.expectedRequests ?? 1,
      expectedRecords: input.expectedRecords ?? 0,
      expectedSuccessfulRecords: input.expectedSuccessfulRecords ?? 0,
      expectedPages: input.expectedPages ?? 0,
      expectedResults: input.expectedResults ?? 0,
      expectedBrowserMinutes: input.expectedBrowserMinutes ?? 0,
      expectedMb: input.expectedMb ?? 0,
      optionsJson: input.optionsJson,
      remainingFreeUnits,
    });

    const estimatedUnits = estimate.usedUnits;
    const freeUnitsApplied = Math.min(remainingFreeUnits, estimatedUnits);
    const paidUnitsApplied = Math.max(estimatedUnits - freeUnitsApplied, 0);
    const unitPriceUsd = estimate.unitPriceUsd;
    const estimatedPaidCostUsd = estimate.calculatedCostUsd;

    // Router decision
    let routerDecision: ExternalCostSimulatorResult['routerDecision'] = 'allow';
    let routerReason = 'Within free tier or no cost rules active.';
    if (estimatedPaidCostUsd > 0) {
      routerDecision = 'allow';
      routerReason = `Estimated paid cost USD ${estimatedPaidCostUsd.toFixed(6)} — within budget.`;
    }

    const breakdown = (estimate.costBreakdownJson ?? {}) as unknown as import('@radar/contracts').ExternalCostBreakdown;

    return {
      costRule: costRule ? mapCostRule(costRule) : null,
      optionMultipliers: optionMultipliers.map(mapOptionMultiplier),
      estimatedUnits,
      freeUnitsRemainingBefore: remainingFreeUnits,
      freeUnitsApplied,
      paidUnitsApplied,
      estimatedPaidCostUsd,
      unitPriceUsd,
      multiplierTotal: estimate.multiplierTotal,
      breakdown,
      routerDecision,
      routerReason,
    };
  }

  // ── P10-14: Cost Adjustments ──────────────────────────────────────────────

  async listCostAdjustments(filter: {
    provider?: string;
    apiKeyId?: string;
  }): Promise<ExternalCostAdjustmentAdminDto[]> {
    let query = this.supabase.from('external_cost_adjustments').select('*').order('created_at', { ascending: false });
    if (filter.provider) query = query.eq('provider', filter.provider);
    if (filter.apiKeyId) query = query.eq('api_key_id', filter.apiKeyId);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list cost adjustments: ${error.message}`);
    return ((data ?? []) as ExternalCostAdjustmentRow[]).map(mapCostAdjustment);
  }

  async createCostAdjustment(
    input: CreateCostAdjustmentInput,
    createdBy: string,
  ): Promise<ExternalCostAdjustmentAdminDto> {
    const payload = {
      usage_event_id: input.usageEventId ?? null,
      provider: input.provider as ExternalProvider,
      provider_account_id: input.providerAccountId ?? null,
      api_key_id: input.apiKeyId ?? null,
      period_start: input.periodStart ?? null,
      period_end: input.periodEnd ?? null,
      adjustment_type: input.adjustmentType,
      unit_delta: asNumber(input.unitDelta, 0),
      cost_delta_usd: asNumber(input.costDeltaUsd, 0),
      reason: input.reason,
      created_by: createdBy,
    };
    const { data, error } = await this.supabase.from('external_cost_adjustments').insert(payload).select('*').single();
    if (error || !data) throw new Error(`Failed to create cost adjustment: ${error?.message ?? 'unknown'}`);
    return mapCostAdjustment(data as ExternalCostAdjustmentRow);
  }

  private async loadRoute(taskType: string): Promise<ExternalProviderRouteRow> {
    const { data, error } = await this.supabase
      .from('external_provider_routes')
      .select('*')
      .eq('task_type', taskType)
      .single();

    if (error || !data) throw new Error(`External provider route ${taskType} was not found`);
    return data as ExternalProviderRouteRow;
  }
}

// ── P10-14 module-level mappers ───────────────────────────────────────────────

function mapCostRule(row: ExternalCostRuleRow): ExternalCostRuleAdminDto {
  return {
    id: row.id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    planProfileId: row.plan_profile_id,
    ruleName: row.rule_name,
    ruleScope: row.rule_scope,
    taskType: row.task_type,
    endpointKey: row.endpoint_key,
    datasetKey: row.dataset_key,
    actorKey: row.actor_key,
    unitType: row.unit_type,
    billingEvent: row.billing_event,
    baseUnits: asNumber(row.base_units, 0),
    unitsPerRequest: row.units_per_request,
    unitsPerRecord: row.units_per_record,
    unitsPerSuccessfulRecord: row.units_per_successful_record,
    unitsPerFailedRequest: row.units_per_failed_request,
    unitsPerPage: row.units_per_page,
    unitsPerSearch: row.units_per_search,
    unitsPerResult: row.units_per_result,
    unitsPerBrowserMinute: row.units_per_browser_minute,
    unitsPerMb: row.units_per_mb,
    unitPriceUsd: row.unit_price_usd,
    minimumUnits: row.minimum_units,
    maximumUnits: row.maximum_units,
    freeTierEligible: row.free_tier_eligible ?? true,
    priority: asNumber(row.priority, 50),
    formulaJson: (row.formula_json ?? {}) as Record<string, unknown>,
    conditionsJson: (row.conditions_json ?? {}) as Record<string, unknown>,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOptionMultiplier(row: ExternalOptionCostMultiplierRow): ExternalOptionMultiplierAdminDto {
  return {
    id: row.id,
    provider: row.provider,
    costRuleId: row.cost_rule_id,
    optionKey: row.option_key,
    optionValue: row.option_value,
    multiplier: asNumber(row.multiplier, 1),
    additionalUnits: asNumber(row.additional_units, 0),
    additionalCostUsd: asNumber(row.additional_cost_usd, 0),
    appliesToTaskTypes: asStringArray(row.applies_to_task_types),
    conditionsJson: (row.conditions_json ?? {}) as Record<string, unknown>,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
  };
}

function mapEndpointCatalog(row: ExternalEndpointCatalogRow): ExternalEndpointCatalogAdminDto {
  return {
    id: row.id,
    provider: row.provider,
    endpointKey: row.endpoint_key,
    displayName: row.display_name,
    taskTypes: asStringArray(row.task_types),
    datasetKey: row.dataset_key,
    actorKey: row.actor_key,
    defaultUnitType: row.default_unit_type,
    defaultCostRuleId: row.default_cost_rule_id,
    supportsTestFlow: row.supports_test_flow ?? false,
    testPayloadJson: (row.test_payload_json ?? {}) as Record<string, unknown>,
    notes: row.notes,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCostAdjustment(row: ExternalCostAdjustmentRow): ExternalCostAdjustmentAdminDto {
  return {
    id: row.id,
    usageEventId: row.usage_event_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    apiKeyId: row.api_key_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    adjustmentType: row.adjustment_type as ExternalCostAdjustmentAdminDto['adjustmentType'],
    unitDelta: asNumber(row.unit_delta, 0),
    costDeltaUsd: asNumber(row.cost_delta_usd, 0),
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function buildCostRulePayload(input: CreateCostRuleInput): Record<string, unknown> {
  return {
    provider: input.provider,
    provider_account_id: input.providerAccountId ?? null,
    plan_profile_id: input.planProfileId ?? null,
    rule_name: input.ruleName,
    rule_scope: input.ruleScope,
    task_type: input.taskType ?? null,
    endpoint_key: input.endpointKey ?? null,
    dataset_key: input.datasetKey ?? null,
    actor_key: input.actorKey ?? null,
    unit_type: input.unitType,
    billing_event: input.billingEvent ?? null,
    base_units: asNumber(input.baseUnits, 0),
    units_per_request: input.unitsPerRequest ?? null,
    units_per_record: input.unitsPerRecord ?? null,
    units_per_successful_record: input.unitsPerSuccessfulRecord ?? null,
    units_per_failed_request: input.unitsPerFailedRequest ?? null,
    units_per_page: input.unitsPerPage ?? null,
    units_per_search: input.unitsPerSearch ?? null,
    units_per_result: input.unitsPerResult ?? null,
    units_per_browser_minute: input.unitsPerBrowserMinute ?? null,
    units_per_mb: input.unitsPerMb ?? null,
    unit_price_usd: input.unitPriceUsd ?? null,
    minimum_units: input.minimumUnits ?? null,
    maximum_units: input.maximumUnits ?? null,
    free_tier_eligible: input.freeTierEligible ?? true,
    priority: input.priority ?? 50,
    formula_json: toJson(input.formulaJson ?? {}),
    conditions_json: toJson(input.conditionsJson ?? {}),
    is_active: input.isActive ?? true,
  };
}
