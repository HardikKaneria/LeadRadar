import { Inject, Injectable } from '@nestjs/common';
import {
  type ArchivedPostCategory,
  type ExternalProvider,
  type LeadHuntingClassification,
  type LeadHuntingOverview,
  type LeadHuntingPostDetail,
  type LeadHuntingPostSummary,
  type LeadHuntingProviderCallSummary,
  type LeadHuntingSessionSummary,
  type LeadHuntingSettings,
  type LeadHuntingSettingsUpdateInput,
  type LeadHuntingUsageSummary,
  type RawPostStatus,
} from '@radar/contracts';
import { ValidationError } from '@radar/core';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { AuditService } from '../audit/audit.service';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type LeadSearchSessionRow = Database['public']['Tables']['lead_search_sessions']['Row'];
type RawPostRow = Database['public']['Tables']['raw_posts']['Row'];
type PostResearchReportRow = Database['public']['Tables']['post_research_reports']['Row'];
type PostClassificationRow = Database['public']['Tables']['post_classifications']['Row'];
type PostResearchJobRow = Database['public']['Tables']['post_research_jobs']['Row'];
type ArchivedPostRow = Database['public']['Tables']['archived_posts']['Row'];
type FieldEvidenceLogRow = Database['public']['Tables']['field_evidence_logs']['Row'];
type ExternalProviderCallRow = Database['public']['Tables']['external_provider_calls']['Row'];
type ExternalUsageEventRow = Database['public']['Tables']['external_usage_events']['Row'];

interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

interface PostListParams extends ListParams {
  queue?: 'all' | 'review' | 'qualified' | 'archive' | 'rejected' | 'failed';
  sessionId?: string;
  status?: RawPostStatus;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const DEFAULT_SETTINGS: LeadHuntingSettings = {
  requireEvidenceForApproval: true,
  warnIfMissingWebsite: true,
  warnIfMissingWorkEmail: true,
  dailyResearchLimit: null,
  monthlyResearchLimit: null,
  monthlyProviderBudgetUsd: null,
  rerunCooldownMinutes: 30,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function startOfDayIso(now = new Date()): string {
  const copy = new Date(now);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function startOfMonthIso(now = new Date()): string {
  const copy = new Date(now);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function statusQueueFilter(queue: PostListParams['queue']): RawPostStatus[] | null {
  switch (queue) {
    case 'review':
      return ['needs_review'];
    case 'qualified':
      return ['qualified_lead'];
    case 'archive':
      return ['archived'];
    case 'rejected':
      return ['rejected'];
    case 'failed':
      return ['failed'];
    default:
      return null;
  }
}

function pickLatestByRawPost<T extends { raw_post_id: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (!map.has(row.raw_post_id)) {
      map.set(row.raw_post_id, row);
    }
  }
  return map;
}

function firstMeaningfulLine(value: string | null): string | null {
  if (!value) return null;
  const line = value
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  return line ?? null;
}

function providerSort(entries: Map<string, { requests: number; cost: number; lastUsedAt: string | null }>) {
  return [...entries.entries()]
    .map(([provider, value]) => ({
      provider: provider as ExternalProvider,
      requests: value.requests,
      estimatedCostUsd: Number(value.cost.toFixed(6)),
      lastUsedAt: value.lastUsedAt,
    }))
    .sort((a, b) => b.requests - a.requests || b.estimatedCostUsd - a.estimatedCostUsd);
}

@Injectable()
export class LeadHuntingOperationsService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly audit: AuditService,
  ) {}

  async getOverview(
    organizationId: string,
    permissions: string[],
  ): Promise<LeadHuntingOverview> {
    const [usage, settings, recentSessions, recentPosts, queues] = await Promise.all([
      this.getUsageSummary(organizationId, permissions),
      this.getSettings(organizationId),
      this.listSessions(organizationId, { page: 1, pageSize: 6 }).then((result) => result.items),
      this.listPosts(organizationId, { page: 1, pageSize: 8 }).then((result) => result.items),
      this.getQueueCounts(organizationId),
    ]);

    return {
      queues,
      usage,
      settings,
      recentSessions,
      recentPosts,
    };
  }

  async listSessions(
    organizationId: string,
    params: ListParams = {},
  ): Promise<PaginatedResult<LeadHuntingSessionSummary>> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const from = (page - 1) * pageSize;

    let query = this.supabase
      .from('lead_search_sessions')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    const search = params.search?.trim();
    if (search) {
      query = query.or(`search_query.ilike.%${search}%,status.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      throw new Error(`Failed to load lead-hunting sessions: ${error.message}`);
    }

    return {
      items: ((data ?? []) as LeadSearchSessionRow[]).map((row) => this.mapSession(row)),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async getSession(
    organizationId: string,
    sessionId: string,
  ): Promise<LeadHuntingSessionSummary | null> {
    const { data, error } = await this.supabase
      .from('lead_search_sessions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', sessionId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load lead-hunting session ${sessionId}: ${error.message}`);
    }

    return data ? this.mapSession(data as LeadSearchSessionRow) : null;
  }

  async listPosts(
    organizationId: string,
    params: PostListParams = {},
  ): Promise<PaginatedResult<LeadHuntingPostSummary>> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const from = (page - 1) * pageSize;

    let query = this.supabase
      .from('raw_posts')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (params.sessionId) query = query.eq('search_session_id', params.sessionId);

    if (params.status) {
      query = query.eq('status', params.status);
    } else {
      const statuses = statusQueueFilter(params.queue);
      if (statuses?.length) query = query.in('status', statuses);
    }

    const search = params.search?.trim();
    if (search) {
      query = query.or(
        `post_text.ilike.%${search}%,post_owner_name.ilike.%${search}%,visible_company_name.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query;
    if (error) {
      throw new Error(`Failed to load lead-hunting posts: ${error.message}`);
    }

    const rows = (data ?? []) as RawPostRow[];
    const related = await this.loadPostDecorators(organizationId, rows.map((row) => row.id));
    const settings = await this.getSettings(organizationId);

    return {
      items: rows.map((row) => this.mapPostSummary(row, related, settings)),
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async getPostDetail(
    organizationId: string,
    rawPostId: string,
  ): Promise<LeadHuntingPostDetail | null> {
    const { data, error } = await this.supabase
      .from('raw_posts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', rawPostId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load lead-hunting post ${rawPostId}: ${error.message}`);
    }
    if (!data) return null;

    const rawPost = data as RawPostRow;
    const settings = await this.getSettings(organizationId);
    const decorators = await this.loadPostDecorators(organizationId, [rawPost.id]);
    const summary = this.mapPostSummary(rawPost, decorators, settings);
    const report = decorators.reports.get(rawPost.id) ?? null;
    const classification = decorators.classifications.get(rawPost.id) ?? null;
    const archived = decorators.archived.get(rawPost.id) ?? null;
    const latestJob = decorators.jobs.get(rawPost.id) ?? null;

    const [session, evidence, providerCalls, discovery] = await Promise.all([
      rawPost.search_session_id ? this.getSession(organizationId, rawPost.search_session_id) : Promise.resolve(null),
      this.loadEvidence(organizationId, rawPost.id),
      this.loadProviderCalls(organizationId, rawPost.id),
      rawPost.discovery_id ? this.loadDiscovery(organizationId, rawPost.discovery_id) : Promise.resolve(null),
    ]);

    return {
      ...summary,
      session,
      report: report
        ? {
            personSummary: report.person_summary,
            companySummary: report.company_summary,
            websiteSummary: report.website_summary,
            emailSummary: report.email_summary,
            managementSummary: report.management_summary,
            countrySummary: report.country_summary,
            opportunitySummary: report.opportunity_summary,
            confidenceScore: report.confidence_score == null ? null : Number(report.confidence_score),
            reportJson: report.report_json,
            primaryCompanyId: report.primary_company_id,
            primaryContactId: report.primary_contact_id,
            targetCompanyId: report.target_company_id,
          }
        : null,
      classificationDetail: classification
        ? {
            id: classification.id,
            classification: classification.classification as LeadHuntingClassification,
            leadScore: classification.lead_score,
            leadQuality: classification.lead_quality,
            isActualLead: classification.is_actual_lead,
            urgency: classification.urgency,
            serviceMatch: classification.service_match,
            reasonJson: classification.reason_json,
            recommendedAction: classification.recommended_action,
            createdAt: classification.created_at,
          }
        : null,
      archived: archived
        ? {
            id: archived.id,
            archiveCategory: archived.archive_category as ArchivedPostCategory,
            topic: archived.topic,
            summary: archived.summary,
            keywords: archived.keywords ?? [],
            reasonForArchive: archived.reason_for_archive,
            marketSignalScore: archived.market_signal_score,
            createdAt: archived.created_at,
          }
        : null,
      discovery,
      latestJob: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status,
            progress: latestJob.progress,
            currentStage: latestJob.current_stage,
            lastError: latestJob.last_error,
            startedAt: latestJob.started_at,
            completedAt: latestJob.completed_at,
            jobRunId: latestJob.job_run_id,
          }
        : null,
      evidence,
      providerCalls,
    };
  }

  async getSettings(organizationId: string): Promise<LeadHuntingSettings> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('settings')
      .eq('id', organizationId)
      .single();

    if (error) {
      throw new Error(`Failed to load lead-hunting settings: ${error.message}`);
    }

    return this.parseSettings((data as Pick<OrganizationRow, 'settings'>).settings);
  }

  async updateSettings(
    organizationId: string,
    actorUserId: string,
    input: LeadHuntingSettingsUpdateInput,
  ): Promise<LeadHuntingSettings> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('settings')
      .eq('id', organizationId)
      .single();

    if (error) {
      throw new Error(`Failed to load organization settings for lead-hunting update: ${error.message}`);
    }

    const rowSettings = (data as Pick<OrganizationRow, 'settings'>).settings;
    const currentSettings = isRecord(rowSettings)
      ? ({ ...rowSettings } as Record<string, unknown>)
      : {};
    const before = this.parseSettings(currentSettings);
    const next: LeadHuntingSettings = {
      requireEvidenceForApproval: input.requireEvidenceForApproval,
      warnIfMissingWebsite: input.warnIfMissingWebsite,
      warnIfMissingWorkEmail: input.warnIfMissingWorkEmail,
      dailyResearchLimit: input.dailyResearchLimit ?? null,
      monthlyResearchLimit: input.monthlyResearchLimit ?? null,
      monthlyProviderBudgetUsd: input.monthlyProviderBudgetUsd ?? null,
      rerunCooldownMinutes: input.rerunCooldownMinutes ?? DEFAULT_SETTINGS.rerunCooldownMinutes,
    };

    currentSettings.leadHunting = toJson(next);

    const { error: updateError } = await this.supabase
      .from('organizations')
      .update({
        settings: currentSettings as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    if (updateError) {
      throw new Error(`Failed to update lead-hunting settings: ${updateError.message}`);
    }

    await this.audit.recordAction({
      organizationId,
      actorId: actorUserId,
      action: 'lead_hunting.settings.updated',
      entityType: 'organization',
      entityId: organizationId,
      before,
      after: next,
    });

    return next;
  }

  async getUsageSummary(
    organizationId: string,
    permissions: string[],
  ): Promise<LeadHuntingUsageSummary> {
    const settings = await this.getSettings(organizationId);
    const dayStart = startOfDayIso();
    const monthStart = startOfMonthIso();

    const [todayCaptured, monthCaptured, dayResearchRuns, monthResearchRuns, dayStatusRows, monthStatusRows, usageEvents, monthlyPosts, monthlyJobs] =
      await Promise.all([
        this.countRawPosts(organizationId, { createdAtFrom: dayStart }),
        this.countRawPosts(organizationId, { createdAtFrom: monthStart }),
        this.countResearchRuns(organizationId, dayStart),
        this.countResearchRuns(organizationId, monthStart),
        this.loadStatusRows(organizationId, dayStart),
        this.loadStatusRows(organizationId, monthStart),
        this.loadUsageEvents(organizationId, monthStart),
        this.loadMonthlyPosts(organizationId, monthStart),
        this.loadMonthlyResearchJobs(organizationId, monthStart),
      ]);

    const todayProviderCalls = usageEvents.filter((row) => row.created_at >= dayStart);
    const providerPermission = permissions.includes('external_providers.usage.read');

    const byProviderMap = new Map<string, { requests: number; cost: number; lastUsedAt: string | null }>();
    let monthProviderCalls = 0;
    let monthProviderCost = 0;
    let dayProviderCalls = 0;
    let dayProviderCost = 0;

    for (const row of usageEvents) {
      const requests = row.requests_count ?? 0;
      const cost = Number(row.estimated_cost ?? 0);
      monthProviderCalls += requests;
      monthProviderCost += cost;

      const entry = byProviderMap.get(row.provider) ?? { requests: 0, cost: 0, lastUsedAt: null };
      entry.requests += requests;
      entry.cost += cost;
      entry.lastUsedAt = entry.lastUsedAt && entry.lastUsedAt > row.created_at ? entry.lastUsedAt : row.created_at;
      byProviderMap.set(row.provider, entry);
    }

    for (const row of todayProviderCalls) {
      dayProviderCalls += row.requests_count ?? 0;
      dayProviderCost += Number(row.estimated_cost ?? 0);
    }

    const byUser = await this.buildUserUsageRows(monthlyPosts, monthlyJobs, usageEvents);

    const todayStatus = this.aggregateStatuses(dayStatusRows);
    const monthStatus = this.aggregateStatuses(monthStatusRows);

    return {
      today: {
        capturedPosts: todayCaptured,
        researchRuns: dayResearchRuns,
        qualifiedPosts: todayStatus.qualifiedPosts,
        needsReviewPosts: todayStatus.needsReviewPosts,
        archivedPosts: todayStatus.archivedPosts,
        rejectedPosts: todayStatus.rejectedPosts,
        providerCalls: dayProviderCalls,
        providerCostUsd: Number(dayProviderCost.toFixed(6)),
      },
      month: {
        capturedPosts: monthCaptured,
        researchRuns: monthResearchRuns,
        qualifiedPosts: monthStatus.qualifiedPosts,
        needsReviewPosts: monthStatus.needsReviewPosts,
        archivedPosts: monthStatus.archivedPosts,
        rejectedPosts: monthStatus.rejectedPosts,
        providerCalls: monthProviderCalls,
        providerCostUsd: Number(monthProviderCost.toFixed(6)),
      },
      limits: {
        dailyResearchLimit: settings.dailyResearchLimit,
        monthlyResearchLimit: settings.monthlyResearchLimit,
        monthlyProviderBudgetUsd: settings.monthlyProviderBudgetUsd,
      },
      remaining: {
        dailyResearchLimit:
          settings.dailyResearchLimit == null ? null : Math.max(0, settings.dailyResearchLimit - dayResearchRuns),
        monthlyResearchLimit:
          settings.monthlyResearchLimit == null ? null : Math.max(0, settings.monthlyResearchLimit - monthResearchRuns),
        monthlyProviderBudgetUsd:
          settings.monthlyProviderBudgetUsd == null
            ? null
            : Number(Math.max(0, settings.monthlyProviderBudgetUsd - monthProviderCost).toFixed(6)),
      },
      byProvider: providerPermission ? providerSort(byProviderMap) : [],
      byUser,
    };
  }

  async assertResearchAllowed(organizationId: string): Promise<void> {
    const usage = await this.getUsageSummary(organizationId, ['external_providers.usage.read']);

    if (
      usage.limits.dailyResearchLimit != null &&
      usage.today.researchRuns >= usage.limits.dailyResearchLimit
    ) {
      throw new ValidationError('This workspace has reached its daily lead-hunting research limit.');
    }
    if (
      usage.limits.monthlyResearchLimit != null &&
      usage.month.researchRuns >= usage.limits.monthlyResearchLimit
    ) {
      throw new ValidationError('This workspace has reached its monthly lead-hunting research limit.');
    }
    if (
      usage.limits.monthlyProviderBudgetUsd != null &&
      usage.month.providerCostUsd >= usage.limits.monthlyProviderBudgetUsd
    ) {
      throw new ValidationError('This workspace has reached its monthly external-provider budget.');
    }
  }

  async assertApprovalAllowed(organizationId: string, rawPostId: string): Promise<void> {
    const settings = await this.getSettings(organizationId);
    if (!settings.requireEvidenceForApproval) return;

    const { count, error } = await this.supabase
      .from('field_evidence_logs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('raw_post_id', rawPostId);

    if (error) {
      throw new Error(`Failed to validate approval evidence for ${rawPostId}: ${error.message}`);
    }
    if ((count ?? 0) <= 0) {
      throw new ValidationError('Approval is blocked until evidence is attached to this raw post.');
    }
  }

  private parseSettings(settings: unknown): LeadHuntingSettings {
    const root = isRecord(settings) ? settings : {};
    const leadHunting = isRecord(root.leadHunting) ? root.leadHunting : {};

    return {
      requireEvidenceForApproval: asBoolean(
        leadHunting.requireEvidenceForApproval,
        DEFAULT_SETTINGS.requireEvidenceForApproval,
      ),
      warnIfMissingWebsite: asBoolean(
        leadHunting.warnIfMissingWebsite,
        DEFAULT_SETTINGS.warnIfMissingWebsite,
      ),
      warnIfMissingWorkEmail: asBoolean(
        leadHunting.warnIfMissingWorkEmail,
        DEFAULT_SETTINGS.warnIfMissingWorkEmail,
      ),
      dailyResearchLimit: asNumber(leadHunting.dailyResearchLimit),
      monthlyResearchLimit: asNumber(leadHunting.monthlyResearchLimit),
      monthlyProviderBudgetUsd: asNumber(leadHunting.monthlyProviderBudgetUsd),
      rerunCooldownMinutes:
        asNumber(leadHunting.rerunCooldownMinutes) ?? DEFAULT_SETTINGS.rerunCooldownMinutes,
    };
  }

  private mapSession(row: LeadSearchSessionRow): LeadHuntingSessionSummary {
    return {
      id: row.id,
      searchQuery: row.search_query,
      searchUrl: row.search_url,
      sourcePlatform: row.source_platform,
      captureMode: row.capture_mode,
      status: row.status,
      parserVersion: row.parser_version,
      capturedByUserId: row.captured_by_user_id,
      totalPostsCaptured: row.total_posts_captured,
      totalUniquePosts: row.total_unique_posts,
      totalDuplicates: row.total_duplicates,
      totalQualified: row.total_qualified,
      totalNeedsReview: row.total_needs_review,
      totalArchived: row.total_archived,
      totalRejected: row.total_rejected,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapPostSummary(
    row: RawPostRow,
    related: {
      classifications: Map<string, PostClassificationRow>;
      reports: Map<string, PostResearchReportRow>;
      jobs: Map<string, PostResearchJobRow>;
      archived: Map<string, ArchivedPostRow>;
    },
    settings: LeadHuntingSettings,
  ): LeadHuntingPostSummary {
    const classification = related.classifications.get(row.id) ?? null;
    const report = related.reports.get(row.id) ?? null;
    const latestJob = related.jobs.get(row.id) ?? null;
    const archived = related.archived.get(row.id) ?? null;
    const missingSignals = this.missingSignals(report, settings);

    return {
      id: row.id,
      searchSessionId: row.search_session_id,
      discoveryId: row.discovery_id,
      archivedPostId: archived?.id ?? null,
      postUrl: row.post_url,
      postText: row.post_text,
      postOwnerName: row.post_owner_name,
      postOwnerHeadline: row.post_owner_headline,
      postOwnerProfileUrl: row.post_owner_profile_url,
      visibleCompanyName: row.visible_company_name,
      visibleCompanyUrl: row.visible_company_url,
      postDate: row.post_date,
      status: row.status as RawPostStatus,
      failureReason: row.failure_reason,
      leadScore: classification?.lead_score ?? null,
      classification: (classification?.classification as LeadHuntingClassification | undefined) ?? null,
      recommendedAction: classification?.recommended_action ?? firstMeaningfulLine(row.post_text),
      confidenceScore: report?.confidence_score == null ? null : Number(report.confidence_score),
      latestJobStatus: latestJob?.status ?? null,
      latestJobProgress: latestJob?.progress ?? null,
      latestJobRunId: latestJob?.job_run_id ?? null,
      missingSignals,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private missingSignals(
    report: PostResearchReportRow | null,
    settings: LeadHuntingSettings,
  ): string[] {
    if (!report) return [];
    const missing: string[] = [];
    if (settings.warnIfMissingWebsite && !report.website_summary) {
      missing.push('Website');
    }
    if (settings.warnIfMissingWorkEmail && !report.email_summary) {
      missing.push('Work email');
    }
    if (!report.management_summary) missing.push('Decision-maker context');
    if (!report.country_summary) missing.push('Country');
    return missing;
  }

  private async loadPostDecorators(organizationId: string, rawPostIds: string[]) {
    if (rawPostIds.length === 0) {
      return {
        classifications: new Map<string, PostClassificationRow>(),
        reports: new Map<string, PostResearchReportRow>(),
        jobs: new Map<string, PostResearchJobRow>(),
        archived: new Map<string, ArchivedPostRow>(),
      };
    }

    const [classifications, reports, jobs, archived] = await Promise.all([
      this.supabase
        .from('post_classifications')
        .select('*')
        .eq('organization_id', organizationId)
        .in('raw_post_id', rawPostIds)
        .order('created_at', { ascending: false }),
      this.supabase
        .from('post_research_reports')
        .select('*')
        .eq('organization_id', organizationId)
        .in('raw_post_id', rawPostIds)
        .order('created_at', { ascending: false }),
      this.supabase
        .from('post_research_jobs')
        .select('*')
        .eq('organization_id', organizationId)
        .in('raw_post_id', rawPostIds)
        .order('created_at', { ascending: false }),
      this.supabase
        .from('archived_posts')
        .select('*')
        .eq('organization_id', organizationId)
        .in('raw_post_id', rawPostIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
    ]);

    if (classifications.error) throw new Error(`Failed to load lead-hunting classifications: ${classifications.error.message}`);
    if (reports.error) throw new Error(`Failed to load lead-hunting reports: ${reports.error.message}`);
    if (jobs.error) throw new Error(`Failed to load lead-hunting jobs: ${jobs.error.message}`);
    if (archived.error) throw new Error(`Failed to load archived lead-hunting posts: ${archived.error.message}`);

    return {
      classifications: pickLatestByRawPost((classifications.data ?? []) as PostClassificationRow[]),
      reports: pickLatestByRawPost((reports.data ?? []) as PostResearchReportRow[]),
      jobs: pickLatestByRawPost((jobs.data ?? []) as PostResearchJobRow[]),
      archived: pickLatestByRawPost((archived.data ?? []) as ArchivedPostRow[]),
    };
  }

  private async loadEvidence(
    organizationId: string,
    rawPostId: string,
  ): Promise<LeadHuntingPostDetail['evidence']> {
    const { data, error } = await this.supabase
      .from('field_evidence_logs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('raw_post_id', rawPostId)
      .order('created_at', { ascending: false })
      .limit(60);

    if (error) {
      throw new Error(`Failed to load lead-hunting evidence: ${error.message}`);
    }

    return ((data ?? []) as FieldEvidenceLogRow[]).map((row) => ({
      id: row.id,
      fieldName: row.field_name,
      fieldValue: row.field_value,
      sourceProvider: row.source_provider,
      sourceType: row.source_type,
      sourceUrl: row.source_url,
      confidenceScore: row.confidence_score == null ? null : Number(row.confidence_score),
      evidenceText: row.evidence_text,
      createdAt: row.created_at,
    }));
  }

  private async loadProviderCalls(
    organizationId: string,
    rawPostId: string,
  ): Promise<LeadHuntingProviderCallSummary[]> {
    const { data, error } = await this.supabase
      .from('external_provider_calls')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('raw_post_id', rawPostId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(`Failed to load external provider calls: ${error.message}`);
    }

    return ((data ?? []) as ExternalProviderCallRow[]).map((row) => ({
      id: row.id,
      provider: row.provider as ExternalProvider,
      taskType: row.task_type,
      status: row.status,
      attemptNumber: row.attempt_number,
      latencyMs: row.latency_ms,
      estimatedCostUsd: Number(row.estimated_cost ?? 0),
      error: row.error,
      createdAt: row.created_at,
    }));
  }

  private async loadDiscovery(
    organizationId: string,
    discoveryId: string,
  ): Promise<LeadHuntingPostDetail['discovery']> {
    const { data, error } = await this.supabase
      .from('discoveries')
      .select('id, title, status, created_at')
      .eq('organization_id', organizationId)
      .eq('id', discoveryId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load linked discovery ${discoveryId}: ${error.message}`);
    }

    if (!data) return null;

    return {
      id: data.id,
      title: data.title,
      status: data.status,
      createdAt: data.created_at,
    };
  }

  private async getQueueCounts(organizationId: string): Promise<LeadHuntingOverview['queues']> {
    const [researching, needsReview, qualified, archived, rejected, failed] = await Promise.all([
      this.countByStatus(organizationId, 'researching'),
      this.countByStatus(organizationId, 'needs_review'),
      this.countByStatus(organizationId, 'qualified_lead'),
      this.countByStatus(organizationId, 'archived'),
      this.countByStatus(organizationId, 'rejected'),
      this.countByStatus(organizationId, 'failed'),
    ]);

    return {
      researching,
      needsReview,
      qualified,
      archived,
      rejected,
      failed,
    };
  }

  private async countByStatus(organizationId: string, status: RawPostStatus): Promise<number> {
    const { count, error } = await this.supabase
      .from('raw_posts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', status)
      .is('deleted_at', null);

    if (error) throw new Error(`Failed to count ${status} lead-hunting posts: ${error.message}`);
    return count ?? 0;
  }

  private async countRawPosts(
    organizationId: string,
    input: { createdAtFrom: string },
  ): Promise<number> {
    const { count, error } = await this.supabase
      .from('raw_posts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .gte('created_at', input.createdAtFrom);

    if (error) throw new Error(`Failed to count raw lead-hunting posts: ${error.message}`);
    return count ?? 0;
  }

  private async countResearchRuns(organizationId: string, startedAtFrom: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('post_research_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('started_at', startedAtFrom);

    if (error) throw new Error(`Failed to count lead-hunting research runs: ${error.message}`);
    return count ?? 0;
  }

  private async loadStatusRows(organizationId: string, updatedAtFrom: string): Promise<Array<Pick<RawPostRow, 'status'>>> {
    const { data, error } = await this.supabase
      .from('raw_posts')
      .select('status')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .gte('updated_at', updatedAtFrom)
      .in('status', ['qualified_lead', 'needs_review', 'archived', 'rejected']);

    if (error) throw new Error(`Failed to load lead-hunting status rows: ${error.message}`);
    return (data ?? []) as Array<Pick<RawPostRow, 'status'>>;
  }

  private aggregateStatuses(rows: Array<Pick<RawPostRow, 'status'>>) {
    let qualifiedPosts = 0;
    let needsReviewPosts = 0;
    let archivedPosts = 0;
    let rejectedPosts = 0;

    for (const row of rows) {
      if (row.status === 'qualified_lead') qualifiedPosts += 1;
      if (row.status === 'needs_review') needsReviewPosts += 1;
      if (row.status === 'archived') archivedPosts += 1;
      if (row.status === 'rejected') rejectedPosts += 1;
    }

    return { qualifiedPosts, needsReviewPosts, archivedPosts, rejectedPosts };
  }

  private async loadUsageEvents(
    organizationId: string,
    createdAtFrom: string,
  ): Promise<ExternalUsageEventRow[]> {
    const { data, error } = await this.supabase
      .from('external_usage_events')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('created_at', createdAtFrom)
      .order('created_at', { ascending: false })
      .limit(5_000);

    if (error) throw new Error(`Failed to load external provider usage events: ${error.message}`);
    return (data ?? []) as ExternalUsageEventRow[];
  }

  private async loadMonthlyPosts(
    organizationId: string,
    createdAtFrom: string,
  ): Promise<Array<Pick<RawPostRow, 'id' | 'captured_by_user_id' | 'status'>>> {
    const { data, error } = await this.supabase
      .from('raw_posts')
      .select('id, captured_by_user_id, status')
      .eq('organization_id', organizationId)
      .gte('created_at', createdAtFrom)
      .is('deleted_at', null)
      .limit(5_000);

    if (error) throw new Error(`Failed to load monthly lead-hunting posts: ${error.message}`);
    return (data ?? []) as Array<Pick<RawPostRow, 'id' | 'captured_by_user_id' | 'status'>>;
  }

  private async loadMonthlyResearchJobs(
    organizationId: string,
    startedAtFrom: string,
  ): Promise<Array<Pick<PostResearchJobRow, 'raw_post_id'>>> {
    const { data, error } = await this.supabase
      .from('post_research_jobs')
      .select('raw_post_id')
      .eq('organization_id', organizationId)
      .gte('started_at', startedAtFrom)
      .limit(5_000);

    if (error) throw new Error(`Failed to load monthly lead-hunting research jobs: ${error.message}`);
    return (data ?? []) as Array<Pick<PostResearchJobRow, 'raw_post_id'>>;
  }

  private async buildUserUsageRows(
    monthlyPosts: Array<Pick<RawPostRow, 'id' | 'captured_by_user_id' | 'status'>>,
    monthlyJobs: Array<Pick<PostResearchJobRow, 'raw_post_id'>>,
    usageEvents: ExternalUsageEventRow[],
  ): Promise<LeadHuntingUsageSummary['byUser']> {
    const byUser = new Map<
      string,
      {
        capturedPosts: number;
        researchRuns: number;
        qualifiedPosts: number;
        providerCalls: number;
        providerCostUsd: number;
      }
    >();

    const rawPostUser = new Map<string, string | null>();

    for (const row of monthlyPosts) {
      const userId = row.captured_by_user_id ?? 'unknown';
      rawPostUser.set(row.id, row.captured_by_user_id);
      const current = byUser.get(userId) ?? {
        capturedPosts: 0,
        researchRuns: 0,
        qualifiedPosts: 0,
        providerCalls: 0,
        providerCostUsd: 0,
      };
      current.capturedPosts += 1;
      if (row.status === 'qualified_lead') current.qualifiedPosts += 1;
      byUser.set(userId, current);
    }

    for (const row of monthlyJobs) {
      const userId = rawPostUser.get(row.raw_post_id) ?? 'unknown';
      const current = byUser.get(userId) ?? {
        capturedPosts: 0,
        researchRuns: 0,
        qualifiedPosts: 0,
        providerCalls: 0,
        providerCostUsd: 0,
      };
      current.researchRuns += 1;
      byUser.set(userId, current);
    }

    for (const row of usageEvents) {
      const userId = row.user_id ?? 'unknown';
      const current = byUser.get(userId) ?? {
        capturedPosts: 0,
        researchRuns: 0,
        qualifiedPosts: 0,
        providerCalls: 0,
        providerCostUsd: 0,
      };
      current.providerCalls += row.requests_count ?? 0;
      current.providerCostUsd += Number(row.estimated_cost ?? 0);
      byUser.set(userId, current);
    }

    const ids = [...byUser.keys()].filter((key) => key !== 'unknown');
    const labels = new Map<string, string>();
    if (ids.length > 0) {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', ids);

      if (error) {
        throw new Error(`Failed to load lead-hunting usage profile labels: ${error.message}`);
      }

      for (const row of data ?? []) {
        labels.set(row.id, asString(row.name) ?? row.email);
      }
    }

    return [...byUser.entries()]
      .map(([key, value]) => ({
        userId: key === 'unknown' ? null : key,
        label: key === 'unknown' ? 'Unassigned activity' : labels.get(key) ?? key.slice(0, 8),
        capturedPosts: value.capturedPosts,
        researchRuns: value.researchRuns,
        qualifiedPosts: value.qualifiedPosts,
        providerCalls: value.providerCalls,
        providerCostUsd: Number(value.providerCostUsd.toFixed(6)),
      }))
      .sort((a, b) => b.researchRuns - a.researchRuns || b.capturedPosts - a.capturedPosts);
  }
}
