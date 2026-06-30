// Thin-API client. Auth/data live in Supabase (see lib/supabase.ts); this only covers the
// server-side endpoints (jobs, AI, webhooks) that need the NestJS service.

import type {
  RevenueForecastResult,
  AiPrivacyModeResponse,
  AiProviderSettingsResponse,
  AiProviderSettingsSummary,
  AiProviderSettingsUpdateInput,
  AssistantConversationSummary,
  AssistantMeetingPrep,
  AssistantNextAction,
  CsvIngestionAccepted,
  CsvIngestionInput,
  DiscoveryIngestionAccepted,
  DraftAssistantMessageInput,
  ExtensionHealthSummary,
  ExtensionTokenCreateInput,
  ExtensionTokenCreated,
  ExtensionTokenSummary,
  JobAccepted,
  ManualDiscoveryInput,
  AiPrivacyModeUpdateInput,
  SummarizeConversationRequest,
  UsageCompanyReport,
  UsageCompanySummaryReport,
  UsageEventsFilter,
  UsageEventsReport,
  UsageLimitsReport,
  UsageMeReport,
  AdminProviderAccountDto,
  AdminApiKeyDto,
  ConversionInsightsResult,
  ReasonInsightsResult,
  ScoringStrategyDto,
  NotificationDto,
  NotificationPreferenceDto,
  NotificationUpdateDto,
  NotificationPreferenceUpdateDto,
  SimilarOpportunityDto,
  DemandRadarClusterDto,
  IntegrationAccountDto,
  ConnectIntegrationDto,
  LeadHuntingOverview,
  LeadHuntingSessionSummary,
  LeadHuntingPostSummary,
  LeadHuntingPostDetail,
  LeadHuntingUsageSummary,
  LeadHuntingSettings,
  LeadHuntingSettingsUpdateInput,
  ExternalProviderAccountAdminDto,
  ExternalProviderAlertEventAdminDto,
  ExternalProviderAlertRuleAdminDto,
  ExternalProviderApiKeyAdminDto,
  ExternalProviderPlanProfileAdminDto,
  ExternalProviderReconciliationAdminDto,
  ExternalProviderRouteAdminDto,
  ExternalProviderTestRunAdminDto,
  ExternalProviderHealthCheckAdminDto,
  ExternalProviderUsageAdminSummary,
  ExternalProviderUsageEventAdminDto,
  ExternalProviderUsageForecastAdminSummary,
  ExternalProviderUsageSnapshotAdminDto,
  ExternalCostRuleAdminDto,
  ExternalOptionMultiplierAdminDto,
  ExternalEndpointCatalogAdminDto,
  ExternalCostAdjustmentAdminDto,
  ExternalCostSimulatorInput,
  ExternalCostSimulatorResult,
} from '@radar/contracts';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const BASE = `${API_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

interface Ctx {
  accessToken: string;
  organizationId: string;
}

function withQuery(
  path: string,
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function request<T>(path: string, ctx: Ctx, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${ctx.accessToken}`);
  headers.set('x-organization-id', ctx.organizationId);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message = (body as { title?: string })?.title ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export type Job = {
  id: string;
  job_name: string;
  status: string;
  progress: number;
  error?: string | null;
  result?: unknown;
  created_at?: string;
  finished_at?: string | null;
};

/** Master-admin AI task route (provider/model per task type, with two fallbacks). */
export interface AdminRouteUpdate {
  primary_provider: string;
  primary_model: string;
  fallback_provider?: string | null;
  fallback_model?: string | null;
  fallback_2_provider?: string | null;
  fallback_2_model?: string | null;
}
export interface AdminRoute extends AdminRouteUpdate {
  task_type: string;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const api = {
  enqueueDemo: (ctx: Ctx) => request<{ jobId: string }>('/jobs/demo', ctx, { method: 'POST' }),
  jobs: (ctx: Ctx) => request<Job[]>('/jobs', ctx),
  job: (ctx: Ctx, id: string) => request<Job>(`/jobs/${id}`, ctx),
  analyzeDiscovery: (ctx: Ctx, id: string) =>
    request<JobAccepted>(`/discoveries/${id}/analyze`, ctx, { method: 'POST' }),
  researchCompany: (ctx: Ctx, id: string) =>
    request<JobAccepted>(`/companies/${id}/research`, ctx, { method: 'POST' }),
  leadHuntingOverview: (ctx: Ctx) =>
    request<LeadHuntingOverview>('/lead-hunting/overview', ctx),
  leadHuntingSessions: (ctx: Ctx, params: { page?: number; pageSize?: number; search?: string } = {}) =>
    request<PaginatedResult<LeadHuntingSessionSummary>>(
      withQuery('/lead-hunting/sessions', {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
      }),
      ctx,
    ),
  leadHuntingSession: (ctx: Ctx, id: string) =>
    request<LeadHuntingSessionSummary | null>(`/lead-hunting/sessions/${id}`, ctx),
  leadHuntingPosts: (
    ctx: Ctx,
    params: {
      page?: number;
      pageSize?: number;
      search?: string;
      queue?: 'all' | 'review' | 'qualified' | 'archive' | 'rejected' | 'failed';
      sessionId?: string;
      status?: string;
    } = {},
  ) =>
    request<PaginatedResult<LeadHuntingPostSummary>>(
      withQuery('/lead-hunting/posts', {
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        queue: params.queue,
        sessionId: params.sessionId,
        status: params.status,
      }),
      ctx,
    ),
  leadHuntingPost: (ctx: Ctx, id: string) =>
    request<LeadHuntingPostDetail | null>(`/lead-hunting/posts/${id}`, ctx),
  leadHuntingUsage: (ctx: Ctx) =>
    request<LeadHuntingUsageSummary>('/lead-hunting/usage', ctx),
  leadHuntingSettings: (ctx: Ctx) =>
    request<LeadHuntingSettings>('/lead-hunting/settings', ctx),
  updateLeadHuntingSettings: (ctx: Ctx, body: LeadHuntingSettingsUpdateInput) =>
    request<LeadHuntingSettings>('/lead-hunting/settings', ctx, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  enqueueLeadHuntingResearch: (ctx: Ctx, id: string) =>
    request<{ jobId: string; postResearchJobId: string }>(`/lead-hunting/posts/${id}/research`, ctx, {
      method: 'POST',
    }),
  reclassifyLeadHuntingPost: (ctx: Ctx, id: string) =>
    request<{ classificationId: string; decision: string; discoveryId: string | null }>(
      `/lead-hunting/posts/${id}/classify`,
      ctx,
      { method: 'POST' },
    ),
  approveLeadHuntingPost: (ctx: Ctx, id: string) =>
    request<{ decision: string; discoveryId: string | null; analysisId: string | null; archivedPostId: string | null }>(
      `/lead-hunting/posts/${id}/approve`,
      ctx,
      { method: 'POST' },
    ),
  archiveLeadHuntingPost: (ctx: Ctx, id: string) =>
    request<{ decision: string; discoveryId: string | null; analysisId: string | null; archivedPostId: string | null }>(
      `/lead-hunting/posts/${id}/archive`,
      ctx,
      { method: 'POST' },
    ),
  rejectLeadHuntingPost: (ctx: Ctx, id: string) =>
    request<{ decision: string; discoveryId: string | null; analysisId: string | null; archivedPostId: string | null }>(
      `/lead-hunting/posts/${id}/reject`,
      ctx,
      { method: 'POST' },
    ),
  usageMe: (ctx: Ctx, period?: string) =>
    request<UsageMeReport>(withQuery('/usage/me', { period }), ctx),
  usageCompany: (ctx: Ctx, period?: string) =>
    request<UsageCompanyReport>(withQuery('/usage/company', { period }), ctx),
  usageCompanySummary: (ctx: Ctx, period?: string) =>
    request<UsageCompanySummaryReport>(withQuery('/usage/company/summary', { period }), ctx),
  usageLimits: (ctx: Ctx, period?: string) =>
    request<UsageLimitsReport>(withQuery('/usage/limits', { period }), ctx),
  aiProviderSettings: (ctx: Ctx) => request<AiProviderSettingsResponse>('/ai/providers', ctx),
  updateAiProviderSetting: (ctx: Ctx, provider: string, body: AiProviderSettingsUpdateInput) =>
    request<AiProviderSettingsSummary>(`/ai/providers/${provider}`, ctx, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  aiPrivacyMode: (ctx: Ctx) => request<AiPrivacyModeResponse>('/ai/privacy-mode', ctx),
  updateAiPrivacyMode: (ctx: Ctx, body: AiPrivacyModeUpdateInput) =>
    request<AiPrivacyModeResponse>('/ai/privacy-mode', ctx, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  usageEvents: (ctx: Ctx, filter: UsageEventsFilter) =>
    request<UsageEventsReport>(
      withQuery('/usage/events', {
        period: filter.period,
        userId: filter.userId,
        taskType: filter.taskType,
        provider: filter.provider,
        model: filter.model,
        status: filter.status,
        dateFrom: filter.dateFrom,
        dateTo: filter.dateTo,
        page: filter.page,
        pageSize: filter.pageSize,
      }),
      ctx,
    ),

  // Discovery ingestion (P2-04). Both endpoints require an Idempotency-Key so a retried
  // submission replays the same batch/job instead of creating a duplicate.
  ingestManual: (ctx: Ctx, body: ManualDiscoveryInput, idempotencyKey: string) =>
    request<DiscoveryIngestionAccepted>('/ingest/manual', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'idempotency-key': idempotencyKey },
    }),
  ingestCsv: (ctx: Ctx, body: CsvIngestionInput, idempotencyKey: string) =>
    request<CsvIngestionAccepted>('/ingest/csv', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'idempotency-key': idempotencyKey },
    }),

  extensionTokens: (ctx: Ctx) => request<ExtensionTokenSummary[]>('/extension/tokens', ctx),
  createExtensionToken: (ctx: Ctx, body: ExtensionTokenCreateInput) =>
    request<ExtensionTokenCreated>('/extension/tokens', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  revokeExtensionToken: (ctx: Ctx, id: string) =>
    request<void>(`/extension/tokens/${id}`, ctx, {
      method: 'DELETE',
    }),
  extensionHealth: (ctx: Ctx) => request<ExtensionHealthSummary>('/extension/health', ctx),
  
  // Knowledge (P7, P8)
  getConversionInsights: (ctx: Ctx, timeframeDays: number, groupBy: string) =>
    request<ConversionInsightsResult>(`/knowledge/insights/conversion?timeframeDays=${timeframeDays}&groupBy=${groupBy}`, ctx),
  getReasonInsights: (ctx: Ctx, timeframeDays: number, groupBy: string) =>
    request<ReasonInsightsResult>(`/knowledge/insights/reasons?timeframeDays=${timeframeDays}&groupBy=${groupBy}`, ctx),
  listKnowledgeEvents: (ctx: Ctx, params: { limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    return request<unknown>(`/knowledge/events?${q}`, ctx);
  },
  listScoringStrategies: (ctx: Ctx) =>
    request<ScoringStrategyDto[]>('/knowledge/scoring-strategies', ctx),
  activateScoringStrategy: (ctx: Ctx, id: string) =>
    request<{ success: boolean }>(`/knowledge/scoring-strategies/${id}/activate`, ctx, {
      method: 'PUT',
    }),
  getRevenueForecast: (ctx: Ctx) =>
    request<RevenueForecastResult>('/knowledge/forecast/revenue', ctx),
  
  // ── Master Admin (P9-13) ──
  adminProviderAccounts: (ctx: Ctx) => request<{ items: AdminProviderAccountDto[] }>('/admin/providers/accounts', ctx),
  createAdminProviderAccount: (ctx: Ctx, body: { provider: string; accountType: string; accountName: string }) =>
    request<{ success: boolean; id: string }>('/admin/providers/accounts', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteAdminProviderAccount: (ctx: Ctx, id: string) =>
    request<{ success: boolean }>(`/admin/providers/accounts/${id}`, ctx, { method: 'DELETE' }),
  adminApiKeys: (ctx: Ctx) => request<{ items: AdminApiKeyDto[] }>('/admin/providers/keys', ctx),
  createAdminApiKey: (ctx: Ctx, body: { providerAccountId: string; apiKey: string; keyName?: string }) =>
    request<{ success: boolean }>('/admin/providers/keys', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAdminApiKey: (ctx: Ctx, id: string, body: { status: string }) =>
    request<{ success: boolean }>(`/admin/providers/keys/${id}`, ctx, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteAdminApiKey: (ctx: Ctx, id: string) =>
    request<{ success: boolean }>(`/admin/providers/keys/${id}`, ctx, {
      method: 'DELETE',
    }),
  adminRoutes: (ctx: Ctx) => request<{ items: AdminRoute[] }>('/admin/routing', ctx),
  updateAdminRoute: (ctx: Ctx, taskType: string, body: AdminRouteUpdate) =>
    request<{ success: boolean }>(`/admin/routing/${taskType}`, ctx, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  adminPrompts: (ctx: Ctx) => request<{ items: any[] }>('/admin/prompts', ctx),
  createAdminPrompt: (ctx: Ctx, body: any) =>
    request<{ success: boolean; item: any }>('/admin/prompts', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminUsageEvents: (ctx: Ctx, filter: UsageEventsFilter) =>
    request<UsageEventsReport>(
      withQuery('/admin/usage/events', {
        period: filter.period,
        userId: filter.userId,
        taskType: filter.taskType,
        provider: filter.provider,
        model: filter.model,
        status: filter.status,
        dateFrom: filter.dateFrom,
        dateTo: filter.dateTo,
        page: filter.page,
        pageSize: filter.pageSize,
      }),
      ctx,
    ),
  adminProvisionCompany: (ctx: Ctx, body: { orgName: string; ownerEmail: string; ownerName: string; password?: string }) =>
    request<{ success: boolean; organization: any }>('/admin/companies/provision', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteAdminCompany: (ctx: Ctx, id: string) =>
    request<{ success: boolean }>(`/admin/companies/${id}`, ctx, {
      method: 'DELETE',
    }),
  adminExternalProviderAccounts: (ctx: Ctx) =>
    request<{ items: ExternalProviderAccountAdminDto[] }>('/admin/external/providers', ctx),
  createAdminExternalProviderAccount: (
    ctx: Ctx,
    body: {
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
    },
  ) =>
    request<{ success: boolean; id: string }>('/admin/external/providers', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAdminExternalProviderAccount: (
    ctx: Ctx,
    id: string,
    body: {
      accountName?: string;
      provider?: string;
      accountType?: string;
      status?: string;
      billingOwner?: string | null;
      planProfileId?: string | null;
      allowedOrganizationIds?: string[];
      weeklyBudget?: number | null;
      monthlyBudget?: number | null;
      totalBudget?: number | null;
      rateLimitRpm?: number | null;
      rateLimitTpm?: number | null;
      baseUrl?: string | null;
      notes?: string | null;
    },
  ) =>
    request<{ success: boolean }>(`/admin/external/providers/${id}`, ctx, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAdminExternalProviderAccount: (ctx: Ctx, id: string) =>
    request<{ success: boolean }>(`/admin/external/providers/${id}`, ctx, {
      method: 'DELETE',
    }),
  adminExternalProviderPlans: (ctx: Ctx) =>
    request<{ items: ExternalProviderPlanProfileAdminDto[] }>('/admin/external/plans', ctx),
  createAdminExternalProviderPlan: (ctx: Ctx, body: Record<string, unknown>) =>
    request<{ success: boolean; id: string }>('/admin/external/plans', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAdminExternalProviderPlan: (ctx: Ctx, id: string, body: Record<string, unknown>) =>
    request<{ success: boolean }>(`/admin/external/plans/${id}`, ctx, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminExternalProviderKeys: (ctx: Ctx) =>
    request<{ items: ExternalProviderApiKeyAdminDto[] }>('/admin/external/api-keys', ctx),
  createAdminExternalProviderKey: (
    ctx: Ctx,
    body: {
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
    },
  ) =>
    request<{ success: boolean; id: string }>('/admin/external/api-keys', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAdminExternalProviderKey: (
    ctx: Ctx,
    id: string,
    body: {
      keyName?: string;
      status?: string;
      environment?: string;
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
    },
  ) =>
    request<{ success: boolean }>(`/admin/external/api-keys/${id}`, ctx, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteAdminExternalProviderKey: (ctx: Ctx, id: string) =>
    request<{ success: boolean }>(`/admin/external/api-keys/${id}`, ctx, {
      method: 'DELETE',
    }),
  testAdminExternalProviderKey: (
    ctx: Ctx,
    id: string,
    body: { taskType?: string; testPayload?: unknown; timeoutMs?: number } = {},
  ) =>
    request<{ success: boolean; result: ExternalProviderTestRunAdminDto }>(
      `/admin/external/api-keys/${id}/test`,
      ctx,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  adminExternalProviderRoutes: (ctx: Ctx) =>
    request<{ items: ExternalProviderRouteAdminDto[] }>('/admin/external/routes', ctx),
  createAdminExternalProviderRoute: (ctx: Ctx, body: Record<string, unknown>) =>
    request<{ success: boolean; id: string }>('/admin/external/routes', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateAdminExternalProviderRoute: (
    ctx: Ctx,
    taskType: string,
    body: {
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
    },
  ) =>
    request<{ success: boolean }>(`/admin/external/routes/${taskType}`, ctx, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminExternalProviderHealth: (ctx: Ctx, limit?: number) =>
    request<{ items: ExternalProviderHealthCheckAdminDto[] }>(
      withQuery('/admin/external/health', { limit }),
      ctx,
    ),
  adminExternalProviderUsage: (ctx: Ctx, params: { period?: string; organizationId?: string } = {}) =>
    request<ExternalProviderUsageAdminSummary>(
      withQuery('/admin/external/usage/summary', {
        period: params.period,
        organizationId: params.organizationId,
      }),
      ctx,
    ),
  adminExternalProviderUsageForecast: (ctx: Ctx, params: { period?: string; organizationId?: string } = {}) =>
    request<ExternalProviderUsageForecastAdminSummary>(
      withQuery('/admin/external/usage/forecast', {
        period: params.period,
        organizationId: params.organizationId,
      }),
      ctx,
    ),
  adminExternalProviderUsageEvents: (
    ctx: Ctx,
    params: { period?: string; organizationId?: string; limit?: number } = {},
  ) =>
    request<{ items: ExternalProviderUsageEventAdminDto[] }>(
      withQuery('/admin/external/usage/events', {
        period: params.period,
        organizationId: params.organizationId,
        limit: params.limit,
      }),
      ctx,
    ),
  adminExternalProviderUsageSnapshots: (
    ctx: Ctx,
    params: { limit?: number; periodType?: 'daily' | 'weekly' | 'monthly' | 'trial' | 'custom' } = {},
  ) =>
    request<{ items: ExternalProviderUsageSnapshotAdminDto[] }>(
      withQuery('/admin/external/usage/snapshots', {
        limit: params.limit,
        periodType: params.periodType,
      }),
      ctx,
    ),
  recalculateAdminExternalProviderUsage: (
    ctx: Ctx,
    body: { providerAccountId?: string; apiKeyId?: string },
  ) =>
    request<{ success: boolean; items: ExternalProviderUsageSnapshotAdminDto[] }>(
      '/admin/external/usage/recalculate',
      ctx,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  reconcileAdminExternalProviderUsage: (ctx: Ctx, body: Record<string, unknown>) =>
    request<{ success: boolean; id: string }>('/admin/external/usage/reconcile', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  syncAdminExternalProviderUsage: (ctx: Ctx) =>
    request<{ success: boolean }>('/admin/external/usage/sync', ctx, { method: 'POST' }),
  resetCheckAdminExternalProviderUsage: (ctx: Ctx) =>
    request<{ success: boolean }>('/admin/external/usage/reset-check', ctx, { method: 'POST' }),
  adminExternalProviderAlerts: (ctx: Ctx, limit?: number) =>
    request<{
      rules: ExternalProviderAlertRuleAdminDto[];
      events: ExternalProviderAlertEventAdminDto[];
    }>(withQuery('/admin/external/alerts', { limit }), ctx),
  acknowledgeAdminExternalProviderAlert: (ctx: Ctx, id: string) =>
    request<{ success: boolean }>(`/admin/external/alerts/${id}/acknowledge`, ctx, {
      method: 'PATCH',
    }),
  adminExternalProviderTestRuns: (ctx: Ctx, limit?: number) =>
    request<{ items: ExternalProviderTestRunAdminDto[] }>(
      withQuery('/admin/external/test-runs', { limit }),
      ctx,
    ),
  adminExternalProviderReconciliations: (ctx: Ctx, limit?: number) =>
    request<{ items: ExternalProviderReconciliationAdminDto[] }>(
      withQuery('/admin/external/reconciliations', { limit }),
      ctx,
    ),

  // Cost Rules (P10-14)
  adminExternalCostRules: (ctx: Ctx, filter?: { provider?: string; taskType?: string; isActive?: string }) =>
    request<{ items: ExternalCostRuleAdminDto[] }>(withQuery('/admin/external/cost-rules', filter ?? {}), ctx),
  adminExternalCostRuleDetail: (ctx: Ctx, id: string) =>
    request<ExternalCostRuleAdminDto>(`/admin/external/cost-rules/${id}`, ctx),
  createAdminExternalCostRule: (ctx: Ctx, body: unknown) =>
    request<{ success: boolean; id: string }>('/admin/external/cost-rules', ctx, { method: 'POST', body: JSON.stringify(body) }),
  updateAdminExternalCostRule: (ctx: Ctx, id: string, body: unknown) =>
    request<{ success: boolean }>(`/admin/external/cost-rules/${id}`, ctx, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAdminExternalCostRule: (ctx: Ctx, id: string) =>
    request<{ success: boolean }>(`/admin/external/cost-rules/${id}`, ctx, { method: 'DELETE' }),

  // Option Multipliers (P10-14)
  adminExternalOptionMultipliers: (ctx: Ctx, filter?: { provider?: string }) =>
    request<{ items: ExternalOptionMultiplierAdminDto[] }>(withQuery('/admin/external/option-multipliers', filter ?? {}), ctx),
  upsertAdminExternalOptionMultiplier: (ctx: Ctx, body: unknown) =>
    request<{ success: boolean; id: string }>('/admin/external/option-multipliers', ctx, { method: 'POST', body: JSON.stringify(body) }),
  deleteAdminExternalOptionMultiplier: (ctx: Ctx, id: string) =>
    request<{ success: boolean }>(`/admin/external/option-multipliers/${id}`, ctx, { method: 'DELETE' }),

  // Endpoint Catalog (P10-14)
  adminExternalEndpointCatalog: (ctx: Ctx, filter?: { provider?: string }) =>
    request<{ items: ExternalEndpointCatalogAdminDto[] }>(withQuery('/admin/external/endpoint-catalog', filter ?? {}), ctx),
  upsertAdminExternalEndpoint: (ctx: Ctx, body: unknown) =>
    request<{ success: boolean; id: string }>('/admin/external/endpoint-catalog', ctx, { method: 'POST', body: JSON.stringify(body) }),
  deleteAdminExternalEndpoint: (ctx: Ctx, id: string) =>
    request<{ success: boolean }>(`/admin/external/endpoint-catalog/${id}`, ctx, { method: 'DELETE' }),

  // Cost Simulator (P10-14)
  runAdminExternalCostSimulator: (ctx: Ctx, body: ExternalCostSimulatorInput) =>
    request<ExternalCostSimulatorResult>('/admin/external/cost-simulator', ctx, { method: 'POST', body: JSON.stringify(body) }),

  // Cost Adjustments (P10-14)
  adminExternalCostAdjustments: (ctx: Ctx, filter?: { provider?: string }) =>
    request<{ items: ExternalCostAdjustmentAdminDto[] }>(withQuery('/admin/external/cost-adjustments', filter ?? {}), ctx),
  createAdminExternalCostAdjustment: (ctx: Ctx, body: unknown) =>
    request<{ success: boolean; id: string }>('/admin/external/cost-adjustments', ctx, { method: 'POST', body: JSON.stringify(body) }),

  // Billing plans & subscriptions
  billingPlans: () => request<any[]>('/billing/plans', { accessToken: '', organizationId: '' }),
  adminListSubscriptions: (ctx: Ctx) => request<any[]>('/admin/billing/subscriptions', ctx),
  adminListOrganizations: (ctx: Ctx) => request<{ id: string; name: string; created_at: string }[]>('/admin/billing/organizations', ctx),
  adminGetOrgBilling: (ctx: Ctx, orgId: string) =>
    request<{ subscription: any; usage: Record<string, number> }>(`/admin/billing/org/${orgId}`, ctx),
  adminAssignPlan: (ctx: Ctx, body: { organizationId: string; planSlug: string }) =>
    request<any>('/admin/billing/assign', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  inviteUser: (ctx: Ctx, email: string, roleSlug: string, password?: string) =>
    request<{ success: boolean; userId: string }>('/users/invite', ctx, {
      method: 'POST',
      body: JSON.stringify({ email, roleSlug, password }),
    }),

  // AI Sales Assistant (P6-02 / P6-04).
  draftAssistantMessage: (ctx: Ctx, body: DraftAssistantMessageInput) =>
    request<unknown>('/assistant/draft-message', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  summarizeConversation: (ctx: Ctx, body: SummarizeConversationRequest) =>
    request<AssistantConversationSummary>('/assistant/summarize', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  assistantMeetingPrep: (ctx: Ctx, entityType: string, entityId: string) =>
    request<AssistantMeetingPrep>('/assistant/meeting-prep', ctx, {
      method: 'POST',
      body: JSON.stringify({ entityType, entityId }),
    }),
  assistantNextAction: (ctx: Ctx, entityType: string, entityId: string) =>
    request<AssistantNextAction>('/assistant/next-action', ctx, {
      method: 'POST',
      body: JSON.stringify({ entityType, entityId }),
    }),

  // Proposal Generator (P6-03).
  generateProposal: (ctx: Ctx, body: { entityType: 'lead' | 'opportunity'; entityId: string }) =>
    request<JobAccepted>('/proposals/generate', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProposalStatus: (
    ctx: Ctx,
    proposalId: string,
    body: { status: 'sent' | 'accepted' | 'rejected' | 'expired' },
  ) =>
    request<unknown>(`/proposals/${proposalId}/status`, ctx, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // Notifications (P9-10)
  listNotifications: (ctx: Ctx) => request<NotificationDto[]>('/notifications', ctx),
  updateNotification: (ctx: Ctx, id: string, body: NotificationUpdateDto) =>
    request<{ success: boolean }>(`/notifications/${id}`, ctx, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  markAllNotificationsAsRead: (ctx: Ctx) =>
    request<{ success: boolean }>('/notifications/read-all', ctx, { method: 'PUT' }),
  getNotificationPreferences: (ctx: Ctx) =>
    request<NotificationPreferenceDto>('/notifications/preferences', ctx),
  updateNotificationPreferences: (ctx: Ctx, body: NotificationPreferenceUpdateDto) =>
    request<NotificationPreferenceDto>('/notifications/preferences', ctx, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    
  // Opportunities
  getSimilarOpportunities: (ctx: Ctx, opportunityId: string) =>
    request<SimilarOpportunityDto[]>(`/opportunities/${opportunityId}/similar`, ctx),
  getDemandRadar: (ctx: Ctx) =>
    request<DemandRadarClusterDto[]>('/opportunities/demand-radar', ctx),

  // Integrations
  getIntegrations: (ctx: Ctx) =>
    request<IntegrationAccountDto[]>('/integrations', ctx),
  connectIntegration: (ctx: Ctx, body: ConnectIntegrationDto) =>
    request<IntegrationAccountDto>('/integrations', ctx, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  disconnectIntegration: (ctx: Ctx, id: string) =>
    request<void>(`/integrations/${id}`, ctx, {
      method: 'DELETE',
    }),

  // Generic escape hatch for pages that need ad-hoc requests
  request: <T = unknown>(path: string, ctx: Ctx, init?: RequestInit) => request<T>(path, ctx, init),
};
