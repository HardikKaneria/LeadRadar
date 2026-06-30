import type { Database, Json } from '@radar/supabase';

export type ExternalProvider = Database['public']['Enums']['external_provider'];
export type ExternalProviderTaskType = Database['public']['Enums']['external_provider_task_type'];
export type ExternalCallStatus = Database['public']['Enums']['external_call_status'];
export type ExternalProviderAccountType =
  Database['public']['Enums']['external_provider_account_type'];
export type ExternalProviderUnitType =
  Database['public']['Enums']['external_provider_unit_type'];
export type ExternalUsageSnapshotPeriodType =
  Database['public']['Enums']['external_usage_snapshot_period_type'];
export type ExternalCostRuleScope = Database['public']['Enums']['external_cost_rule_scope'];
export type ExternalBillingEvent = Database['public']['Enums']['external_billing_event'];
export type ExternalCostSource = Database['public']['Enums']['external_cost_source'];
export type ExternalCostRuleRow = Database['public']['Tables']['external_cost_rules']['Row'];
export type ExternalOptionCostMultiplierRow = Database['public']['Tables']['external_option_cost_multipliers']['Row'];
export type ExternalEndpointCatalogRow = Database['public']['Tables']['external_endpoint_catalog']['Row'];
export type ExternalCostAdjustmentRow = Database['public']['Tables']['external_cost_adjustments']['Row'];

export type ExternalProviderAccountRow =
  Database['public']['Tables']['external_provider_accounts']['Row'];
export type ExternalApiKeyRow = Database['public']['Tables']['external_api_keys']['Row'];
export type ExternalProviderRouteRow =
  Database['public']['Tables']['external_provider_routes']['Row'];
export type ExternalProviderPlanProfileRow =
  Database['public']['Tables']['external_provider_plan_profiles']['Row'];
export type ExternalUsageReservationRow =
  Database['public']['Tables']['external_usage_reservations']['Row'];
export type ExternalUsageSnapshotRow =
  Database['public']['Tables']['external_usage_snapshots']['Row'];
export type ExternalAlertRuleRow =
  Database['public']['Tables']['external_alert_rules']['Row'];
export type ExternalAlertEventRow =
  Database['public']['Tables']['external_alert_events']['Row'];
export type ExternalProviderTestRunRow =
  Database['public']['Tables']['external_provider_test_runs']['Row'];
export type ExternalUsageReconciliationRow =
  Database['public']['Tables']['external_usage_reconciliations']['Row'];
export type ExternalProviderCacheEntryRow =
  Database['public']['Tables']['external_provider_cache_entries']['Row'];

export interface ExternalProviderKeyCandidate {
  key: ExternalApiKeyRow;
  account: ExternalProviderAccountRow;
  planProfile: ExternalProviderPlanProfileRow | null;
}

export interface ExternalProviderCredential {
  provider: ExternalProvider;
  apiKey: string;
  apiKeyId: string;
  providerAccountId: string;
  providerAccountName: string;
  baseUrl: string | null;
  isFreeTier: boolean;
  keyName: string;
  maskedKeyPreview: string | null;
  planProfileId: string | null;
  planProfile: ExternalProviderPlanProfileRow | null;
  keyState: ExternalApiKeyRow;
}

export interface ExternalUsageMetrics {
  unitType: ExternalProviderUnitType | null;
  requestCount: number;
  recordCount: number;
  pageCount: number;
  searchCount: number;
  creditCost: number;
  usdCreditCost: number;
  usedUnits: number;
  estimatedCostUsd: number;
  freeUnitsApplied: number;
  paidUnitsApplied: number;
  paidCostUsd: number;
  // Extended cost tracking (P10-14)
  successfulRecordCount: number;
  failedRecordCount: number;
  resultCount: number;
  browserMinutes: number;
  dataMb: number;
  baseUnits: number;
  multiplierTotal: number;
  finalUnits: number;
  billableUnits: number;
  unitPriceUsd: number;
  calculatedCostUsd: number;
  providerReportedUnits: number | null;
  providerReportedCostUsd: number | null;
  costSource: ExternalCostSource | null;
  costRuleId: string | null;
  costBreakdownJson: Record<string, unknown>;
}

export interface ExternalProviderCredentialClaim {
  credential: ExternalProviderCredential;
  reservationId: string;
  requestHash: string | null;
  estimate: ExternalUsageMetrics;
}

export interface ExternalProviderTaskRoute {
  id: string;
  taskType: ExternalProviderTaskType;
  attempts: ExternalProvider[];
  allowManualFallback: boolean;
  requiresBrowser: boolean;
  requiresJson: boolean;
  timeoutMs?: number;
  maxAttempts: number;
  notes?: string;
}

export interface ExternalProviderAdapterContext<TRequest> {
  organizationId: string;
  userId?: string | null;
  taskType: ExternalProviderTaskType;
  rawPostId?: string | null;
  searchSessionId?: string | null;
  postResearchJobId?: string | null;
  jobRunId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  timeoutMs?: number;
  request: TRequest;
  credential: ExternalProviderCredential;
  planProfile?: ExternalProviderPlanProfileRow | null;
}

export interface ExternalProviderAdapterResponse<TResponse> {
  response: TResponse;
  normalizedData?: Json;
  status?: Extract<ExternalCallStatus, 'ok' | 'cached' | 'success'>;
  requestCount?: number;
  recordCount?: number;
  pageCount?: number;
  searchCount?: number;
  creditCost?: number;
  usdCreditCost?: number;
  usedUnits?: number;
  estimatedCostUsd?: number;
  freeUnitsApplied?: number;
  paidUnitsApplied?: number;
  paidCostUsd?: number;
  providerRequestId?: string | null;
  requestRef?: Json;
  responseRef?: Json;
  responseSummary?: Json;
  cacheTtlSeconds?: number | null;
  cacheConfidenceScore?: number | null;
}

export interface ExternalProviderTestContext<TRequest = unknown> {
  taskType: ExternalProviderTaskType;
  credential: ExternalProviderCredential;
  timeoutMs?: number;
  payload: TRequest;
  planProfile?: ExternalProviderPlanProfileRow | null;
}

export interface ExternalProviderUsageSyncResult {
  unitType: ExternalProviderUnitType | null;
  periodStart: string;
  periodEnd: string;
  providerReportedUnits: number;
  rawSummary: Json;
}

export interface ExternalProviderAdapter<TRequest = unknown, TResponse = unknown> {
  readonly provider: ExternalProvider;
  buildCacheKey?(taskType: ExternalProviderTaskType, request: TRequest): string | null;
  testKey?(
    context: ExternalProviderTestContext<TRequest>,
  ): Promise<ExternalProviderAdapterResponse<TResponse>>;
  syncUsage?(
    context: {
      credential: ExternalProviderCredential;
      planProfile?: ExternalProviderPlanProfileRow | null;
      periodType: ExternalUsageSnapshotPeriodType;
      periodStart: string;
      periodEnd: string;
    },
  ): Promise<ExternalProviderUsageSyncResult | null>;
  execute(
    context: ExternalProviderAdapterContext<TRequest>,
  ): Promise<ExternalProviderAdapterResponse<TResponse>>;
}

export interface ExternalProviderExecuteInput<TRequest> {
  organizationId: string;
  userId?: string | null;
  taskType: ExternalProviderTaskType;
  request: TRequest;
  rawPostId?: string | null;
  searchSessionId?: string | null;
  postResearchJobId?: string | null;
  jobRunId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  options?: {
    forceFresh?: boolean;
  };
}

export interface ExternalProviderExecuteSuccess<TResponse> {
  kind: 'success';
  provider: ExternalProvider;
  routeId: string;
  callId: string;
  response: TResponse;
  status: Extract<ExternalCallStatus, 'ok' | 'cached' | 'success'>;
  usage: ExternalUsageMetrics;
  providerRequestId: string | null;
}

export interface ExternalProviderManualFallback {
  kind: 'manual_fallback';
  routeId: string;
  reason: string;
  attemptedProviders: ExternalProvider[];
}

export type ExternalProviderExecuteResult<TResponse> =
  | ExternalProviderExecuteSuccess<TResponse>
  | ExternalProviderManualFallback;

interface ExternalProviderErrorOptions {
  retryAfterSeconds?: number;
  requestRef?: Json;
  responseRef?: Json;
}

export class ExternalProviderExecutionError extends Error {
  readonly retryAfterSeconds?: number;
  readonly requestRef?: Json;
  readonly responseRef?: Json;

  constructor(message: string, options: ExternalProviderErrorOptions = {}) {
    super(message);
    this.name = 'ExternalProviderExecutionError';
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.requestRef = options.requestRef;
    this.responseRef = options.responseRef;
  }
}

export class ExternalProviderRateLimitError extends ExternalProviderExecutionError {
  constructor(message: string, options: ExternalProviderErrorOptions = {}) {
    super(message, options);
    this.name = 'ExternalProviderRateLimitError';
  }
}

export const EXTERNAL_PROVIDER_ACCOUNT_PRIORITY: Record<ExternalProviderAccountType, number> = {
  free_tier: 0,
  trial: 1,
  self_hosted: 2,
  paid: 3,
  internal: 4,
  byok: 5,
};
