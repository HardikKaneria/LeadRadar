import { z } from 'zod';

export const RAW_POST_STATUSES = [
  'raw_captured',
  'duplicate_linked',
  'queued_for_research',
  'researching',
  'provider_post_enriched',
  'person_resolved',
  'company_resolved',
  'website_found',
  'website_researched',
  'email_checked',
  'management_found',
  'country_resolved',
  'evidence_built',
  'ai_classified',
  'qualified_lead',
  'needs_review',
  'archived',
  'rejected',
  'failed',
  'cancelled',
] as const;
export type RawPostStatus = (typeof RAW_POST_STATUSES)[number];

export const LEAD_HUNTING_CLASSIFICATIONS = [
  'actual_requirement',
  'hiring_requirement',
  'service_needed',
  'vendor_needed',
  'partnership_opportunity',
  'funding_signal',
  'expansion_signal',
  'complaint_or_pain_signal',
  'buying_intent_signal',
  'informational_post',
  'personal_branding_post',
  'news_update',
  'promotion_only',
  'job_seeker_post',
  'irrelevant',
  'spam',
] as const;
export type LeadHuntingClassification = (typeof LEAD_HUNTING_CLASSIFICATIONS)[number];

export const ARCHIVED_POST_CATEGORIES = [
  'market_insight',
  'competitor_activity',
  'industry_news',
  'educational_content',
  'personal_branding',
  'general_update',
  'irrelevant',
  'spam',
] as const;
export type ArchivedPostCategory = (typeof ARCHIVED_POST_CATEGORIES)[number];

export const EXTERNAL_PROVIDERS = [
  'bright_data',
  'apify',
  'people_data_labs',
  'tavily',
  'serpapi',
  'firecrawl',
  'scraperapi',
  'manual',
  'internal',
] as const;
export type ExternalProvider = (typeof EXTERNAL_PROVIDERS)[number];

export const EXTERNAL_PROVIDER_TASK_TYPES = [
  'linkedin_post_lookup',
  'linkedin_profile_lookup',
  'linkedin_company_lookup',
  'person_enrichment',
  'company_enrichment',
  'website_discovery',
  'website_crawl',
  'email_discovery',
  'management_discovery',
  'country_resolution',
  'tech_stack_detection',
  'public_search',
  'blocked_website_fetch',
  'provider_health_check',
  'provider_test_flow',
] as const;
export type ExternalProviderTaskType = (typeof EXTERNAL_PROVIDER_TASK_TYPES)[number];

export const EXTERNAL_PROVIDER_ACCOUNT_TYPES = [
  'free_tier',
  'paid',
  'byok',
  'self_hosted',
  'trial',
  'internal',
] as const;
export type ExternalProviderAccountType = (typeof EXTERNAL_PROVIDER_ACCOUNT_TYPES)[number];

export const EXTERNAL_PROVIDER_ACCOUNT_STATUSES = [
  'active',
  'limited',
  'disabled',
  'expired',
  'suspended',
] as const;
export type ExternalProviderAccountStatus = (typeof EXTERNAL_PROVIDER_ACCOUNT_STATUSES)[number];

export const EXTERNAL_API_KEY_STATUSES = [
  'active',
  'limited',
  'cooldown',
  'exhausted',
  'failed',
  'revoked',
  'expired',
] as const;
export type ExternalApiKeyStatus = (typeof EXTERNAL_API_KEY_STATUSES)[number];

export const EXTERNAL_PROVIDER_HEALTH_STATUSES = ['ok', 'degraded', 'down'] as const;
export type ExternalProviderHealthStatus = (typeof EXTERNAL_PROVIDER_HEALTH_STATUSES)[number];

export const EXTERNAL_CALL_STATUSES = [
  'ok',
  'error',
  'fallback',
  'rate_limited',
  'cached',
  'success',
  'failed',
  'skipped_cache',
  'test_success',
  'test_failed',
] as const;
export type ExternalCallStatus = (typeof EXTERNAL_CALL_STATUSES)[number];

export const EXTERNAL_PROVIDER_PLAN_TYPES = ['free', 'trial', 'paid', 'custom'] as const;
export type ExternalProviderPlanType = (typeof EXTERNAL_PROVIDER_PLAN_TYPES)[number];

export const EXTERNAL_PROVIDER_UNIT_TYPES = [
  'request',
  'record',
  'credit',
  'usd_credit',
  'search',
  'page',
  'token',
  'compute_unit',
  'api_credit',
  'successful_record',
  'failed_request',
  'result',
  'browser_minute',
  'data_transfer_mb',
  'provider_reported',
  'custom',
] as const;
export type ExternalProviderUnitType = (typeof EXTERNAL_PROVIDER_UNIT_TYPES)[number];

export const EXTERNAL_PROVIDER_RENEWAL_INTERVALS = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'trial',
  'custom',
  'manual',
] as const;
export type ExternalProviderRenewalInterval = (typeof EXTERNAL_PROVIDER_RENEWAL_INTERVALS)[number];

export const EXTERNAL_USAGE_SNAPSHOT_PERIOD_TYPES = [
  'daily',
  'weekly',
  'monthly',
  'trial',
  'custom',
] as const;
export type ExternalUsageSnapshotPeriodType =
  (typeof EXTERNAL_USAGE_SNAPSHOT_PERIOD_TYPES)[number];

export const EXTERNAL_ALERT_TYPES = [
  'info',
  'warning',
  'high',
  'critical',
  'exhausted',
  'projected_exhaustion',
  'trial_expiry',
  'fallback_started',
  'paid_cost_risk',
  'variance_detected',
  'renewed',
  'all_keys_exhausted',
] as const;
export type ExternalAlertType = (typeof EXTERNAL_ALERT_TYPES)[number];

export const EXTERNAL_ALERT_STATUSES = ['new', 'sent', 'acknowledged', 'resolved'] as const;
export type ExternalAlertStatus = (typeof EXTERNAL_ALERT_STATUSES)[number];

export const EXTERNAL_PROVIDER_TEST_STATUSES = ['queued', 'running', 'passed', 'failed'] as const;
export type ExternalProviderTestStatus = (typeof EXTERNAL_PROVIDER_TEST_STATUSES)[number];

export const EXTERNAL_USAGE_RECONCILIATION_STATUSES = [
  'pending',
  'matched',
  'variance_detected',
  'manually_adjusted',
  'unsupported',
] as const;
export type ExternalUsageReconciliationStatus =
  (typeof EXTERNAL_USAGE_RECONCILIATION_STATUSES)[number];

export const EXTERNAL_COST_RULE_SCOPES = [
  'provider_default', 'endpoint', 'dataset', 'actor', 'task_type',
  'option_multiplier', 'response_field', 'manual_override',
] as const;
export type ExternalCostRuleScope = (typeof EXTERNAL_COST_RULE_SCOPES)[number];

export const EXTERNAL_BILLING_EVENTS = [
  'before_call', 'after_success', 'after_failure', 'after_provider_report', 'after_response_count',
] as const;
export type ExternalBillingEvent = (typeof EXTERNAL_BILLING_EVENTS)[number];

export const EXTERNAL_COST_SOURCES = [
  'estimated', 'calculated', 'provider_reported', 'manual_adjusted', 'reconciled',
] as const;
export type ExternalCostSource = (typeof EXTERNAL_COST_SOURCES)[number];

export const EXTERNAL_ROUTE_BEHAVIOR_MODES = [
  'free_only', 'free_then_fallback', 'allow_paid_with_budget', 'manual_approval_required', 'test_only',
] as const;
export type ExternalRouteBehaviorMode = (typeof EXTERNAL_ROUTE_BEHAVIOR_MODES)[number];

export const EXTERNAL_COST_ADJUSTMENT_TYPES = [
  'manual_correction', 'provider_reconciliation', 'refund', 'failed_charge_correction', 'pricing_rule_update',
] as const;
export type ExternalCostAdjustmentType = (typeof EXTERNAL_COST_ADJUSTMENT_TYPES)[number];

export const leadHuntingSettingsUpdateSchema = z.object({
  requireEvidenceForApproval: z.boolean(),
  warnIfMissingWebsite: z.boolean(),
  warnIfMissingWorkEmail: z.boolean(),
  dailyResearchLimit: z.number().int().positive().nullable().optional(),
  monthlyResearchLimit: z.number().int().positive().nullable().optional(),
  monthlyProviderBudgetUsd: z.number().min(0).nullable().optional(),
  rerunCooldownMinutes: z.number().int().min(0).max(10_080).optional(),
});
export type LeadHuntingSettingsUpdateInput = z.infer<typeof leadHuntingSettingsUpdateSchema>;

export interface LeadHuntingSettings {
  requireEvidenceForApproval: boolean;
  warnIfMissingWebsite: boolean;
  warnIfMissingWorkEmail: boolean;
  dailyResearchLimit: number | null;
  monthlyResearchLimit: number | null;
  monthlyProviderBudgetUsd: number | null;
  rerunCooldownMinutes: number;
}

export interface LeadHuntingQueueCounts {
  researching: number;
  needsReview: number;
  qualified: number;
  archived: number;
  rejected: number;
  failed: number;
}

export interface LeadHuntingUsageBucket {
  capturedPosts: number;
  researchRuns: number;
  qualifiedPosts: number;
  needsReviewPosts: number;
  archivedPosts: number;
  rejectedPosts: number;
  providerCalls: number;
  providerCostUsd: number;
}

export interface LeadHuntingProviderUsageRow {
  provider: ExternalProvider;
  requests: number;
  estimatedCostUsd: number;
  lastUsedAt: string | null;
}

export interface LeadHuntingUserUsageRow {
  userId: string | null;
  label: string;
  capturedPosts: number;
  researchRuns: number;
  qualifiedPosts: number;
  providerCalls: number;
  providerCostUsd: number;
}

export interface LeadHuntingUsageSummary {
  today: LeadHuntingUsageBucket;
  month: LeadHuntingUsageBucket;
  limits: {
    dailyResearchLimit: number | null;
    monthlyResearchLimit: number | null;
    monthlyProviderBudgetUsd: number | null;
  };
  remaining: {
    dailyResearchLimit: number | null;
    monthlyResearchLimit: number | null;
    monthlyProviderBudgetUsd: number | null;
  };
  byProvider: LeadHuntingProviderUsageRow[];
  byUser: LeadHuntingUserUsageRow[];
}

export interface LeadHuntingSessionSummary {
  id: string;
  searchQuery: string | null;
  searchUrl: string | null;
  sourcePlatform: string;
  captureMode: string;
  status: string;
  parserVersion: string | null;
  capturedByUserId: string | null;
  totalPostsCaptured: number;
  totalUniquePosts: number;
  totalDuplicates: number;
  totalQualified: number;
  totalNeedsReview: number;
  totalArchived: number;
  totalRejected: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeadHuntingPostSummary {
  id: string;
  searchSessionId: string | null;
  discoveryId: string | null;
  archivedPostId: string | null;
  postUrl: string | null;
  postText: string | null;
  postOwnerName: string | null;
  postOwnerHeadline: string | null;
  postOwnerProfileUrl: string | null;
  visibleCompanyName: string | null;
  visibleCompanyUrl: string | null;
  postDate: string | null;
  status: RawPostStatus;
  failureReason: string | null;
  leadScore: number | null;
  classification: LeadHuntingClassification | null;
  recommendedAction: string | null;
  confidenceScore: number | null;
  latestJobStatus: string | null;
  latestJobProgress: number | null;
  latestJobRunId: string | null;
  missingSignals: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LeadHuntingEvidenceItem {
  id: number;
  fieldName: string;
  fieldValue: string | null;
  sourceProvider: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  confidenceScore: number | null;
  evidenceText: string | null;
  createdAt: string;
}

export interface LeadHuntingProviderCallSummary {
  id: string;
  provider: ExternalProvider;
  taskType: ExternalProviderTaskType;
  status: ExternalCallStatus;
  attemptNumber: number;
  latencyMs: number | null;
  estimatedCostUsd: number;
  error: string | null;
  createdAt: string;
}

export interface LeadHuntingPostDetail extends LeadHuntingPostSummary {
  session: LeadHuntingSessionSummary | null;
  report: {
    personSummary: string | null;
    companySummary: string | null;
    websiteSummary: string | null;
    emailSummary: string | null;
    managementSummary: string | null;
    countrySummary: string | null;
    opportunitySummary: string | null;
    confidenceScore: number | null;
    reportJson: unknown;
    primaryCompanyId: string | null;
    primaryContactId: string | null;
    targetCompanyId: string | null;
  } | null;
  classificationDetail: {
    id: string;
    classification: LeadHuntingClassification;
    leadScore: number;
    leadQuality: string | null;
    isActualLead: boolean;
    urgency: string | null;
    serviceMatch: unknown;
    reasonJson: unknown;
    recommendedAction: string | null;
    createdAt: string;
  } | null;
  archived: {
    id: string;
    archiveCategory: ArchivedPostCategory;
    topic: string | null;
    summary: string | null;
    keywords: string[];
    reasonForArchive: string | null;
    marketSignalScore: number | null;
    createdAt: string;
  } | null;
  discovery: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
  } | null;
  latestJob: {
    id: string;
    status: string;
    progress: number;
    currentStage: string;
    lastError: string | null;
    startedAt: string | null;
    completedAt: string | null;
    jobRunId: string | null;
  } | null;
  evidence: LeadHuntingEvidenceItem[];
  providerCalls: LeadHuntingProviderCallSummary[];
}

export interface LeadHuntingOverview {
  queues: LeadHuntingQueueCounts;
  usage: LeadHuntingUsageSummary;
  settings: LeadHuntingSettings;
  recentSessions: LeadHuntingSessionSummary[];
  recentPosts: LeadHuntingPostSummary[];
}

export interface ExternalProviderPlanProfileAdminDto {
  id: string;
  provider: ExternalProvider;
  planName: string;
  planType: ExternalProviderPlanType;
  unitType: ExternalProviderUnitType;
  freeEntitlementAmount: number;
  includedUnits: number;
  renewalInterval: ExternalProviderRenewalInterval;
  renewalTimezone: string;
  renewalAnchorDay: string | null;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  overageEnabled: boolean;
  overageUnitPrice: number;
  currency: string;
  costRules: unknown;
  providerDashboardUrl: string | null;
  testEnabled: boolean;
  testTaskType: ExternalProviderTaskType | null;
  testPayloadJson: unknown;
  testConsumesCredits: boolean;
  expectedResponseShapeJson: unknown;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalProviderUsageSnapshotAdminDto {
  id: string;
  provider: ExternalProvider;
  providerAccountId: string | null;
  apiKeyId: string | null;
  periodType: ExternalUsageSnapshotPeriodType;
  periodStart: string;
  periodEnd: string;
  unitType: ExternalProviderUnitType;
  entitlementUnits: number;
  usedUnits: number;
  remainingUnits: number;
  usagePercent: number;
  estimatedPaidCostUsd: number;
  projectedExhaustionAt: string | null;
  projectedPeriodCostUsd: number;
  usageVelocityPerDay: number;
  isEstimated: boolean;
  calculatedAt: string;
}

export interface ExternalProviderAccountAdminDto {
  id: string;
  organizationId: string | null;
  provider: ExternalProvider;
  accountName: string;
  accountType: ExternalProviderAccountType;
  billingOwner: string | null;
  status: ExternalProviderAccountStatus;
  planProfileId: string | null;
  planProfileName: string | null;
  allowedOrganizationIds: string[];
  weeklyBudget: number | null;
  monthlyBudget: number | null;
  totalBudget: number | null;
  weeklyUsage: number;
  monthlyUsage: number;
  totalUsage: number;
  rateLimitRpm: number | null;
  rateLimitTpm: number | null;
  baseUrl: string | null;
  notes: string | null;
  latestSnapshot: ExternalProviderUsageSnapshotAdminDto | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalProviderApiKeyAdminDto {
  id: string;
  providerAccountId: string;
  provider: ExternalProvider;
  keyName: string;
  maskedKeyPreview: string | null;
  status: ExternalApiKeyStatus;
  environment: string;
  allowedTaskTypes: ExternalProviderTaskType[];
  allowedOrganizationIds: string[];
  priority: number;
  dailyRequestLimit: number | null;
  weeklyRequestLimit: number | null;
  monthlyRequestLimit: number | null;
  dailyCreditLimit: number | null;
  weeklyCreditLimit: number | null;
  monthlyCreditLimit: number | null;
  dailyRecordLimit: number | null;
  weeklyRecordLimit: number | null;
  monthlyRecordLimit: number | null;
  dailyCostLimit: number | null;
  weeklyCostLimit: number | null;
  monthlyCostLimit: number | null;
  requestsUsedToday: number;
  requestsUsedWeek: number;
  requestsUsedMonth: number;
  unitsUsedToday: number;
  unitsUsedWeek: number;
  unitsUsedMonth: number;
  recordsUsedToday: number;
  recordsUsedWeek: number;
  recordsUsedMonth: number;
  creditsUsedToday: number;
  creditsUsedWeek: number;
  creditsUsedMonth: number;
  costUsedToday: number;
  costUsedWeek: number;
  costUsedMonth: number;
  resetDailyAt: string | null;
  resetWeeklyAt: string | null;
  resetMonthlyAt: string | null;
  reservedRequestsActive: number;
  reservedRecordsActive: number;
  reservedCreditsActive: number;
  reservedUnitsActive: number;
  reservedCostActive: number;
  latestSnapshot: ExternalProviderUsageSnapshotAdminDto | null;
  lastUsedAt: string | null;
  lastError: string | null;
  cooldownUntil: string | null;
  revokedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalProviderRouteAdminDto {
  id: string;
  taskType: ExternalProviderTaskType;
  primaryProvider: ExternalProvider;
  fallbackProvider: ExternalProvider | null;
  fallback2Provider: ExternalProvider | null;
  fallback3Provider: ExternalProvider | null;
  allowManualFallback: boolean;
  requiresBrowser: boolean;
  requiresJson: boolean;
  timeoutMs: number | null;
  maxAttempts: number;
  isActive: boolean;
  notes: string | null;
  updatedAt: string;
}

export interface ExternalProviderHealthCheckAdminDto {
  id: string;
  provider: ExternalProvider;
  providerAccountId: string | null;
  apiKeyId: string | null;
  status: ExternalProviderHealthStatus;
  latencyMs: number | null;
  checkedAt: string;
  detail: unknown;
}

export interface ExternalProviderUsageAdminRow {
  provider: ExternalProvider;
  taskType: ExternalProviderTaskType | null;
  providerAccountId: string | null;
  apiKeyId: string | null;
  organizationId: string | null;
  userId: string | null;
  searchSessionId: string | null;
  unitType: ExternalProviderUnitType | null;
  requests: number;
  records: number;
  pages: number;
  searches: number;
  usedUnits: number;
  freeUnitsApplied: number;
  paidUnitsApplied: number;
  estimatedCostUsd: number;
  paidCostUsd: number;
  skippedCacheCount: number;
  failedCalls: number;
  lastSeenAt: string | null;
}

export interface ExternalProviderUsageEventAdminDto {
  id: string;
  provider: ExternalProvider;
  providerAccountId: string | null;
  apiKeyId: string | null;
  taskType: ExternalProviderTaskType;
  organizationId: string;
  userId: string | null;
  searchSessionId: string | null;
  rawPostId: string | null;
  jobRunId: string | null;
  unitType: ExternalProviderUnitType | null;
  status: ExternalCallStatus;
  requests: number;
  records: number;
  pages: number;
  searches: number;
  usedUnits: number;
  creditCost: number;
  usdCreditCost: number;
  freeUnitsApplied: number;
  paidUnitsApplied: number;
  estimatedCostUsd: number;
  paidCostUsd: number;
  providerRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  // Extended cost breakdown fields (added in P10-14)
  endpointKey: string | null;
  datasetKey: string | null;
  actorKey: string | null;
  baseUnits: number;
  multiplierTotal: number;
  finalUnits: number;
  billableUnits: number;
  successfulRecordCount: number;
  failedRecordCount: number;
  resultCount: number;
  browserMinutes: number;
  dataMb: number;
  unitPriceUsd: number;
  calculatedCostUsd: number;
  providerReportedUnits: number | null;
  providerReportedCostUsd: number | null;
  costSource: ExternalCostSource | null;
  costRuleId: string | null;
  costBreakdownJson: Record<string, unknown>;
}

export interface ExternalProviderVelocityAdminSummary {
  averageUnitsPerHour: number;
  averageUnitsPerDay: number;
  peakUsageDay: string | null;
  last24hUsage: number;
  last7dUsage: number;
}

export interface ExternalProviderBusinessEfficiencyAdminSummary {
  costPerCapturedPost: number | null;
  costPerResearchedPost: number | null;
  costPerQualifiedLead: number | null;
  costPerArchivedPost: number | null;
  costPerOpportunity: number | null;
}

export interface ExternalProviderSavingsAdminSummary {
  freeCreditsUsed: number;
  estimatedCostAvoidedUsd: number;
  paidOverageRiskUsd: number;
}

export interface ExternalProviderUsageForecastAdminSummary {
  period: string;
  currentPeriod: ExternalProviderUsageSnapshotAdminDto[];
  velocity: ExternalProviderVelocityAdminSummary;
  projections: {
    projectedExhaustionAt: string | null;
    projectedPeriodEndUsage: number;
    projectedPaidUnits: number;
    projectedPaidCostUsd: number;
  };
  businessEfficiency: ExternalProviderBusinessEfficiencyAdminSummary;
  savings: ExternalProviderSavingsAdminSummary;
}

export interface ExternalProviderAlertRuleAdminDto {
  id: string;
  provider: ExternalProvider | null;
  apiKeyId: string | null;
  thresholdPercent: number | null;
  alertType: ExternalAlertType;
  notifyMasterAdmin: boolean;
  notifyCompanyAdmin: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface ExternalProviderAlertEventAdminDto {
  id: string;
  provider: ExternalProvider;
  providerAccountId: string | null;
  apiKeyId: string | null;
  alertRuleId: string | null;
  alertType: ExternalAlertType;
  thresholdPercent: number | null;
  message: string;
  data: unknown;
  status: ExternalAlertStatus;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

export interface ExternalProviderTestRunAdminDto {
  id: string;
  provider: ExternalProvider;
  providerAccountId: string | null;
  apiKeyId: string | null;
  taskType: ExternalProviderTaskType;
  testName: string;
  status: ExternalProviderTestStatus;
  requestPayload: unknown;
  responseSummary: unknown;
  latencyMs: number | null;
  estimatedUnitsUsed: number;
  estimatedCostUsd: number;
  errorCode: string | null;
  errorMessage: string | null;
  jobRunId: string | null;
  createdBy: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ExternalProviderReconciliationAdminDto {
  id: string;
  provider: ExternalProvider;
  providerAccountId: string | null;
  apiKeyId: string | null;
  periodStart: string;
  periodEnd: string;
  internalUsedUnits: number;
  providerReportedUnits: number | null;
  varianceUnits: number | null;
  variancePercent: number | null;
  status: ExternalUsageReconciliationStatus;
  rawSummary: unknown;
  createdAt: string;
}

export interface ExternalProviderUsageAdminSummary {
  period: string;
  totals: {
    requests: number;
    usedUnits: number;
    estimatedCostUsd: number;
    paidCostUsd: number;
    rateLimitEvents: number;
    fallbackCount: number;
    failedCalls: number;
    skippedCacheCount: number;
  };
  byProvider: ExternalProviderUsageAdminRow[];
  byTask: ExternalProviderUsageAdminRow[];
  byOrganization: ExternalProviderUsageAdminRow[];
  byUser: ExternalProviderUsageAdminRow[];
  bySearchSession: ExternalProviderUsageAdminRow[];
  recentRateLimits: Array<{
    id: string;
    provider: ExternalProvider;
    taskType: ExternalProviderTaskType | null;
    limitType: string;
    retryAfterSeconds: number | null;
    occurredAt: string;
  }>;
  snapshots: ExternalProviderUsageSnapshotAdminDto[];
  recentEvents: ExternalProviderUsageEventAdminDto[];
}

// ── P10-14: Cost Intelligence DTOs ────────────────────────────────────────────

export interface ExternalCostBreakdown {
  provider: string;
  taskType: string;
  endpointKey: string | null;
  datasetKey: string | null;
  actorKey: string | null;
  costRule: string | null;
  costRuleId: string | null;
  unitType: ExternalProviderUnitType | null;
  baseUnits: number;
  requestCount: number;
  recordCount: number;
  successfulRecordCount: number;
  failedRecordCount: number;
  pageCount: number;
  resultCount: number;
  browserMinutes: number;
  dataMb: number;
  optionMultipliers: Array<{ key: string; value: string | null; multiplier: number }>;
  multiplierTotal: number;
  finalUnits: number;
  freeUnitsBefore: number;
  freeUnitsRemainingBefore: number;
  freeUnitsApplied: number;
  paidUnitsApplied: number;
  unitPriceUsd: number;
  calculatedCostUsd: number;
  providerReportedUnits: number | null;
  providerReportedCostUsd: number | null;
  costSource: ExternalCostSource;
}

export interface ExternalCostRuleAdminDto {
  id: string;
  provider: ExternalProvider;
  providerAccountId: string | null;
  planProfileId: string | null;
  ruleName: string;
  ruleScope: ExternalCostRuleScope;
  taskType: ExternalProviderTaskType | null;
  endpointKey: string | null;
  datasetKey: string | null;
  actorKey: string | null;
  unitType: ExternalProviderUnitType;
  billingEvent: ExternalBillingEvent;
  baseUnits: number;
  unitsPerRequest: number;
  unitsPerRecord: number;
  unitsPerSuccessfulRecord: number;
  unitsPerFailedRequest: number;
  unitsPerPage: number;
  unitsPerSearch: number;
  unitsPerResult: number;
  unitsPerBrowserMinute: number;
  unitsPerMb: number;
  unitPriceUsd: number;
  minimumUnits: number;
  maximumUnits: number | null;
  freeTierEligible: boolean;
  priority: number;
  formulaJson: Record<string, unknown>;
  conditionsJson: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalOptionMultiplierAdminDto {
  id: string;
  provider: ExternalProvider;
  costRuleId: string | null;
  optionKey: string;
  optionValue: string | null;
  multiplier: number;
  additionalUnits: number;
  additionalCostUsd: number;
  appliesToTaskTypes: string[];
  conditionsJson: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export interface ExternalEndpointCatalogAdminDto {
  id: string;
  provider: ExternalProvider;
  endpointKey: string;
  displayName: string;
  taskTypes: string[];
  datasetKey: string | null;
  actorKey: string | null;
  defaultUnitType: ExternalProviderUnitType | null;
  defaultCostRuleId: string | null;
  supportsTestFlow: boolean;
  testPayloadJson: Record<string, unknown>;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalCostAdjustmentAdminDto {
  id: string;
  usageEventId: string | null;
  provider: ExternalProvider;
  providerAccountId: string | null;
  apiKeyId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  adjustmentType: ExternalCostAdjustmentType;
  unitDelta: number;
  costDeltaUsd: number;
  reason: string;
  createdBy: string | null;
  createdAt: string;
}

export interface ExternalCostSimulatorInput {
  provider: ExternalProvider;
  taskType: ExternalProviderTaskType;
  endpointKey?: string | null;
  datasetKey?: string | null;
  actorKey?: string | null;
  expectedRequests?: number;
  expectedRecords?: number;
  expectedSuccessfulRecords?: number;
  expectedPages?: number;
  expectedResults?: number;
  expectedBrowserMinutes?: number;
  expectedMb?: number;
  optionsJson?: Record<string, unknown>;
  apiKeyId?: string | null;
}

export interface ExternalCostSimulatorResult {
  costRule: ExternalCostRuleAdminDto | null;
  optionMultipliers: ExternalOptionMultiplierAdminDto[];
  estimatedUnits: number;
  freeUnitsRemainingBefore: number;
  freeUnitsApplied: number;
  paidUnitsApplied: number;
  estimatedPaidCostUsd: number;
  unitPriceUsd: number;
  multiplierTotal: number;
  breakdown: ExternalCostBreakdown;
  routerDecision: 'allow' | 'block_free_only' | 'block_budget' | 'require_approval';
  routerReason: string;
}
