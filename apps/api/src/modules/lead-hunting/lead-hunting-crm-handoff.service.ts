import { Inject, Injectable } from '@nestjs/common';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AuditService } from '../audit/audit.service';
import {
  clampScore,
  determineLeadHuntingDecision,
  firstMeaningfulLine,
  normalizeReportState,
  type LeadHuntingRouteDecision,
} from './lead-hunting-pipeline.types';
import type { LeadHuntingClassificationResult } from './lead-hunting-classification.service';
import { LeadHuntingOperationsService } from './lead-hunting-operations.service';

type RawPostRow = Database['public']['Tables']['raw_posts']['Row'];
type DiscoveryRow = Database['public']['Tables']['discoveries']['Row'];
type AiAnalysisRow = Database['public']['Tables']['ai_analysis']['Row'];
type CompanyRow = Database['public']['Tables']['companies']['Row'];
type ContactRow = Database['public']['Tables']['contacts']['Row'];
type PostResearchReportRow = Database['public']['Tables']['post_research_reports']['Row'];
type PostClassificationRow = Database['public']['Tables']['post_classifications']['Row'];
type ArchivedPostRow = Database['public']['Tables']['archived_posts']['Row'];

interface RouteResult {
  decision: LeadHuntingRouteDecision;
  discoveryId: string | null;
  analysisId: string | null;
  archivedPostId: string | null;
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function coerceUrgency(value: string | null | undefined): AiAnalysisRow['urgency'] {
  switch (value) {
    case 'urgent':
    case 'soon':
    case 'later':
    case 'none':
      return value;
    default:
      return 'none';
  }
}

function deriveIntent(classification: PostClassificationRow['classification']): AiAnalysisRow['intent'] {
  switch (classification) {
    case 'actual_requirement':
    case 'service_needed':
    case 'vendor_needed':
    case 'buying_intent_signal':
      return 'high';
    case 'hiring_requirement':
    case 'partnership_opportunity':
    case 'funding_signal':
    case 'expansion_signal':
    case 'complaint_or_pain_signal':
      return 'medium';
    case 'informational_post':
    case 'news_update':
      return 'low';
    default:
      return 'unclear';
  }
}

function summarizeReasons(value: Json): string | null {
  if (!Array.isArray(value)) return null;
  const parts = value.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim().length > 0) return [entry.trim()];
    if (typeof entry === 'object' && entry && 'text' in entry && typeof entry.text === 'string') {
      return entry.text.trim().length > 0 ? [entry.text.trim()] : [];
    }
    return [];
  });
  return parts.length ? parts.join('; ') : null;
}

function extractBudgetHint(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null;
  const match = text.match(/\$([\d,.]+)|([\d,.]+)\s*(?:USD|EUR|GBP|INR)/i);
  const numeric = match?.[1] ?? match?.[2];
  if (!numeric) return null;
  const parsed = Number(numeric.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class LeadHuntingCrmHandoffService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly operations: LeadHuntingOperationsService,
    private readonly audit: AuditService,
  ) {}

  async routeClassification(input: {
    organizationId: string;
    rawPost: RawPostRow;
    report: PostResearchReportRow;
    classification: LeadHuntingClassificationResult;
    actorUserId: string;
  }): Promise<RouteResult> {
    const decision = input.classification.decision;

    if (decision === 'qualified_lead' || decision === 'needs_review') {
      const discovery = await this.upsertDiscovery(input, decision === 'qualified_lead' ? 'reviewed' : 'analyzed');
      const analysis = await this.insertAnalysis(input.organizationId, discovery.id, input.report, input.classification.row);
      await this.updateRawPost(input.rawPost.id, {
        discovery_id: discovery.id,
        status: decision,
        failure_reason: null,
      });
      await this.syncLinkedSessionTotals(input.rawPost.id);
      return {
        decision,
        discoveryId: discovery.id,
        analysisId: analysis.id,
        archivedPostId: null,
      };
    }

    if (decision === 'archived') {
      const archived = await this.upsertArchivedPost({
        organizationId: input.organizationId,
        rawPost: input.rawPost,
        classification: input.classification,
      });
      await this.ignoreDiscoveryIfLinked(input.rawPost.discovery_id);
      await this.updateRawPost(input.rawPost.id, {
        status: 'archived',
        failure_reason: null,
      });
      await this.syncLinkedSessionTotals(input.rawPost.id);
      return {
        decision,
        discoveryId: input.rawPost.discovery_id,
        analysisId: null,
        archivedPostId: archived.id,
      };
    }

    await this.ignoreDiscoveryIfLinked(input.rawPost.discovery_id);
    await this.updateRawPost(input.rawPost.id, {
      status: 'rejected',
      failure_reason: null,
    });
    await this.syncLinkedSessionTotals(input.rawPost.id);
    return {
      decision,
      discoveryId: input.rawPost.discovery_id,
      analysisId: null,
      archivedPostId: null,
    };
  }

  async approveRawPost(
    organizationId: string,
    rawPostId: string,
    actorUserId: string,
  ): Promise<RouteResult> {
    await this.operations.assertApprovalAllowed(organizationId, rawPostId);
    const { rawPost, report, classification } = await this.loadDecisionContext(organizationId, rawPostId);
    const discovery = await this.upsertDiscovery(
      { organizationId, rawPost, report, classification, actorUserId },
      'approved',
    );
    const analysis = await this.insertAnalysis(organizationId, discovery.id, report, classification.row);
    await this.updateRawPost(rawPost.id, {
      discovery_id: discovery.id,
      status: 'qualified_lead',
      failure_reason: null,
    });
    await this.syncLinkedSessionTotals(rawPost.id);
    await this.audit.recordAction({
      organizationId,
      actorId: actorUserId,
      action: 'lead_hunting.post.approved',
      entityType: 'raw_post',
      entityId: rawPost.id,
      after: {
        rawPostId: rawPost.id,
        discoveryId: discovery.id,
        analysisId: analysis.id,
        decision: 'qualified_lead',
      },
    });
    return {
      decision: 'qualified_lead',
      discoveryId: discovery.id,
      analysisId: analysis.id,
      archivedPostId: null,
    };
  }

  async archiveRawPost(
    organizationId: string,
    rawPostId: string,
    actorUserId: string,
  ): Promise<RouteResult> {
    const { rawPost, classification } = await this.loadDecisionContext(organizationId, rawPostId);
    const archived = await this.upsertArchivedPost({ organizationId, rawPost, classification });
    await this.ignoreDiscoveryIfLinked(rawPost.discovery_id);
    await this.updateRawPost(rawPost.id, {
      status: 'archived',
      failure_reason: null,
    });
    await this.syncLinkedSessionTotals(rawPost.id);
    await this.audit.recordAction({
      organizationId,
      actorId: actorUserId,
      action: 'lead_hunting.post.archived',
      entityType: 'raw_post',
      entityId: rawPost.id,
      after: {
        rawPostId: rawPost.id,
        archivedPostId: archived.id,
        decision: 'archived',
      },
    });
    return {
      decision: 'archived',
      discoveryId: rawPost.discovery_id,
      analysisId: null,
      archivedPostId: archived.id,
    };
  }

  async rejectRawPost(
    organizationId: string,
    rawPostId: string,
    actorUserId: string,
  ): Promise<RouteResult> {
    const { rawPost } = await this.loadDecisionContext(organizationId, rawPostId);
    await this.ignoreDiscoveryIfLinked(rawPost.discovery_id);
    await this.updateRawPost(rawPost.id, {
      status: 'rejected',
      failure_reason: null,
    });
    await this.syncLinkedSessionTotals(rawPost.id);
    await this.audit.recordAction({
      organizationId,
      actorId: actorUserId,
      action: 'lead_hunting.post.rejected',
      entityType: 'raw_post',
      entityId: rawPost.id,
      after: {
        rawPostId: rawPost.id,
        decision: 'rejected',
      },
    });
    return {
      decision: 'rejected',
      discoveryId: rawPost.discovery_id,
      analysisId: null,
      archivedPostId: null,
    };
  }

  private async loadDecisionContext(organizationId: string, rawPostId: string): Promise<{
    rawPost: RawPostRow;
    report: PostResearchReportRow;
    classification: LeadHuntingClassificationResult;
  }> {
    const rawPost = await this.loadRawPost(organizationId, rawPostId);
    const report = await this.loadLatestReport(organizationId, rawPostId);
    const classification = await this.loadLatestClassification(organizationId, rawPostId);
    return { rawPost, report, classification };
  }

  private async upsertDiscovery(
    input: {
      organizationId: string;
      rawPost: RawPostRow;
      report: PostResearchReportRow;
      classification: LeadHuntingClassificationResult;
      actorUserId: string;
    },
    status: DiscoveryRow['status'],
  ): Promise<DiscoveryRow> {
    const reportState = normalizeReportState(input.report.report_json);
    const company = await this.ensureCompany(
      input.organizationId,
      reportState.company?.name ?? input.rawPost.visible_company_name,
      reportState.company?.domain ?? reportState.website?.domain,
      reportState.country?.country ?? reportState.company?.country,
      input.actorUserId,
    );
    const contact = await this.ensureContact(
      input.organizationId,
      reportState.person?.name ?? input.rawPost.post_owner_name,
      company?.id ?? null,
      reportState.email?.email,
      reportState.person?.headline ?? input.rawPost.post_owner_headline,
      reportState.person?.linkedinUrl ?? input.rawPost.post_owner_profile_url,
      input.actorUserId,
    );

    const proposed: Database['public']['Tables']['discoveries']['Insert'] = {
      organization_id: input.organizationId,
      source: input.rawPost.source_platform,
      status,
      raw_payload: this.buildDiscoveryPayload(input.rawPost, input.report, input.classification, company, contact),
      title:
        input.report.opportunity_summary ??
        firstMeaningfulLine(input.rawPost.post_text) ??
        `${input.rawPost.post_owner_name ?? 'LinkedIn'} at ${input.rawPost.visible_company_name ?? 'Unknown company'}`,
      description: input.rawPost.post_text ?? input.report.opportunity_summary ?? input.classification.classifier.summary,
      company_name: company?.name ?? input.rawPost.visible_company_name,
      contact_name: contact?.name ?? input.rawPost.post_owner_name,
      email: contact?.email ?? reportState.email?.email ?? null,
      website: company?.domain ? `https://${company.domain}` : reportState.website?.url ?? null,
      country: company?.country ?? reportState.country?.country ?? null,
      budget_hint: extractBudgetHint(input.rawPost.post_text),
      dedup_hash: input.rawPost.dedup_hash,
      created_by: input.actorUserId,
    };

    const existing = input.rawPost.discovery_id
      ? await this.loadDiscoveryById(input.organizationId, input.rawPost.discovery_id)
      : await this.loadDiscoveryByDedupHash(input.organizationId, input.rawPost.dedup_hash);

    if (existing) {
      const patch: Database['public']['Tables']['discoveries']['Update'] = {
        status,
        raw_payload: this.buildDiscoveryPayload(input.rawPost, input.report, input.classification, company, contact, existing.raw_payload),
        title: existing.title ?? proposed.title,
        description: existing.description ?? proposed.description,
        company_name: existing.company_name ?? proposed.company_name,
        contact_name: existing.contact_name ?? proposed.contact_name,
        email: existing.email ?? proposed.email,
        website: existing.website ?? proposed.website,
        country: existing.country ?? proposed.country,
        budget_hint: existing.budget_hint ?? proposed.budget_hint,
      };

      const { data, error } = await this.supabase
        .from('discoveries')
        .update(patch)
        .eq('id', existing.id)
        .eq('organization_id', input.organizationId)
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(`Failed to update discovery ${existing.id}: ${error?.message ?? 'unknown error'}`);
      }

      return data as DiscoveryRow;
    }

    const { data, error } = await this.supabase
      .from('discoveries')
      .insert(proposed)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create discovery for raw post ${input.rawPost.id}: ${error?.message ?? 'unknown error'}`);
    }

    return data as DiscoveryRow;
  }

  private buildDiscoveryPayload(
    rawPost: RawPostRow,
    report: PostResearchReportRow,
    classification: LeadHuntingClassificationResult,
    company: CompanyRow | null,
    contact: ContactRow | null,
    existingRawPayload?: Json,
  ): Json {
    const existing = typeof existingRawPayload === 'object' && existingRawPayload && !Array.isArray(existingRawPayload)
      ? (existingRawPayload as Record<string, unknown>)
      : {};

    return toJson({
      ...existing,
      leadHunting: {
        rawPostId: rawPost.id,
        searchSessionId: rawPost.search_session_id,
        postResearchReportId: report.id,
        postClassificationId: classification.row.id,
        decision: classification.decision,
        classification: classification.row.classification,
        leadScore: classification.row.lead_score,
        summary: classification.classifier.summary,
        archive: classification.archive,
        canonicalCompanyId: company?.id ?? null,
        canonicalContactId: contact?.id ?? null,
        routedAt: new Date().toISOString(),
      },
    });
  }

  private async insertAnalysis(
    organizationId: string,
    discoveryId: string,
    report: PostResearchReportRow,
    classification: PostClassificationRow,
  ): Promise<AiAnalysisRow> {
    const payload: Database['public']['Tables']['ai_analysis']['Insert'] = {
      organization_id: organizationId,
      discovery_id: discoveryId,
      score: classification.lead_score,
      intent: deriveIntent(classification.classification),
      urgency: coerceUrgency(classification.urgency),
      service_match: classification.service_match,
      budget_estimate: null,
      confidence: clampScore(report.confidence_score, classification.lead_score) / 100,
      recommended_action: classification.recommended_action,
      reason: summarizeReasons(classification.reason_json) ?? report.opportunity_summary ?? null,
      is_bad_lead: false,
      scoring_strategy_id: null,
      ai_prompt_version_id: classification.ai_prompt_version_id,
      model_meta: toJson({
        source: 'lead_hunting',
        rawPostId: report.raw_post_id,
        postResearchReportId: report.id,
        postClassificationId: classification.id,
      }),
    };

    const { data, error } = await this.supabase
      .from('ai_analysis')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create ai_analysis row for discovery ${discoveryId}: ${error?.message ?? 'unknown error'}`);
    }

    return data as AiAnalysisRow;
  }

  private async upsertArchivedPost(input: {
    organizationId: string;
    rawPost: RawPostRow;
    classification: LeadHuntingClassificationResult;
  }): Promise<ArchivedPostRow> {
    const current = await this.loadLiveArchivedPost(input.rawPost.id);
    const archive = input.classification.archive ?? {
      archiveCategory:
        input.classification.row.classification === 'spam'
          ? 'spam'
          : input.classification.row.classification === 'irrelevant'
            ? 'irrelevant'
            : 'general_update',
      topic: input.rawPost.visible_company_name ?? input.rawPost.post_owner_name ?? null,
      summary: input.classification.classifier.summary,
      keywords: [],
      reasonForArchive:
        summarizeReasons(input.classification.row.reason_json) ??
        'Operator/archive routing marked this post as non-CRM output.',
      marketSignalScore: input.classification.row.lead_score,
    };

    const patch: Database['public']['Tables']['archived_posts']['Insert'] = {
      organization_id: input.organizationId,
      raw_post_id: input.rawPost.id,
      archive_category: archive.archiveCategory,
      topic: archive.topic,
      summary: archive.summary,
      keywords: archive.keywords,
      reason_for_archive: archive.reasonForArchive,
      market_signal_score: archive.marketSignalScore,
    };

    if (current) {
      const { data, error } = await this.supabase
        .from('archived_posts')
        .update({
          archive_category: patch.archive_category,
          topic: patch.topic,
          summary: patch.summary,
          keywords: patch.keywords,
          reason_for_archive: patch.reason_for_archive,
          market_signal_score: patch.market_signal_score,
          deleted_at: null,
        })
        .eq('id', current.id)
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(`Failed to update archived post ${current.id}: ${error?.message ?? 'unknown error'}`);
      }

      return data as ArchivedPostRow;
    }

    const { data, error } = await this.supabase
      .from('archived_posts')
      .insert(patch)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create archived post for raw post ${input.rawPost.id}: ${error?.message ?? 'unknown error'}`);
    }

    return data as ArchivedPostRow;
  }

  async ensureCompany(
    organizationId: string,
    name: string | null | undefined,
    domain: string | null | undefined,
    country: string | null | undefined,
    createdBy: string,
  ): Promise<CompanyRow | null> {
    const normalizedName = name?.trim() ? name.trim() : null;
    if (!normalizedName) return null;
    const normalizedDomain = domain?.trim() ? domain.trim().toLowerCase() : null;

    let query = this.supabase
      .from('companies')
      .select('*')
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    if (normalizedDomain) {
      query = query.eq('domain', normalizedDomain);
    } else {
      query = query.ilike('name', normalizedName);
    }

    const { data: existing, error: lookupError } = await query.limit(1).maybeSingle();
    if (lookupError) {
      throw new Error(`Failed to load company for lead-hunting handoff: ${lookupError.message}`);
    }

    if (existing) {
      const { data, error } = await this.supabase
        .from('companies')
        .update({
          domain: existing.domain ?? normalizedDomain,
          country: existing.country ?? country ?? null,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error || !data) {
        throw new Error(`Failed to update company ${existing.id}: ${error?.message ?? 'unknown error'}`);
      }
      return data as CompanyRow;
    }

    const { data, error } = await this.supabase
      .from('companies')
      .insert({
        organization_id: organizationId,
        name: normalizedName,
        domain: normalizedDomain,
        country: country ?? null,
        tech_stack: [],
        enrichment: {},
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create company "${normalizedName}": ${error?.message ?? 'unknown error'}`);
    }
    return data as CompanyRow;
  }

  async ensureContact(
    organizationId: string,
    name: string | null | undefined,
    companyId: string | null,
    email: string | null | undefined,
    title: string | null | undefined,
    linkedinUrl: string | null | undefined,
    createdBy: string,
  ): Promise<ContactRow | null> {
    const normalizedName = name?.trim() ? name.trim() : null;
    if (!normalizedName) return null;
    const normalizedEmail = email?.trim() ? email.trim().toLowerCase() : null;

    let query = this.supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    if (normalizedEmail) {
      query = query.eq('email', normalizedEmail);
    } else if (companyId) {
      query = query.eq('company_id', companyId).ilike('name', normalizedName);
    } else {
      query = query.ilike('name', normalizedName);
    }

    const { data: existing, error: lookupError } = await query.limit(1).maybeSingle();
    if (lookupError) {
      throw new Error(`Failed to load contact for lead-hunting handoff: ${lookupError.message}`);
    }

    if (existing) {
      const { data, error } = await this.supabase
        .from('contacts')
        .update({
          company_id: existing.company_id ?? companyId,
          email: existing.email ?? normalizedEmail,
          title: existing.title ?? title ?? null,
          linkedin_url: existing.linkedin_url ?? linkedinUrl ?? null,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error || !data) {
        throw new Error(`Failed to update contact ${existing.id}: ${error?.message ?? 'unknown error'}`);
      }
      return data as ContactRow;
    }

    const { data, error } = await this.supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        company_id: companyId,
        name: normalizedName,
        email: normalizedEmail,
        title: title ?? null,
        linkedin_url: linkedinUrl ?? null,
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create contact "${normalizedName}": ${error?.message ?? 'unknown error'}`);
    }

    return data as ContactRow;
  }

  private async ignoreDiscoveryIfLinked(discoveryId: string | null): Promise<void> {
    if (!discoveryId) return;
    const { error } = await this.supabase.from('discoveries').update({ status: 'ignored' }).eq('id', discoveryId);
    if (error) {
      throw new Error(`Failed to ignore discovery ${discoveryId}: ${error.message}`);
    }
  }

  private async updateRawPost(
    rawPostId: string,
    patch: Database['public']['Tables']['raw_posts']['Update'],
  ): Promise<void> {
    const { error } = await this.supabase.from('raw_posts').update(patch).eq('id', rawPostId);
    if (error) {
      throw new Error(`Failed to update raw post ${rawPostId}: ${error.message}`);
    }
  }

  private async syncLinkedSessionTotals(rawPostId: string): Promise<void> {
    const { data: links, error: linksError } = await this.supabase
      .from('lead_search_session_posts')
      .select('search_session_id')
      .eq('raw_post_id', rawPostId);

    if (linksError) {
      throw new Error(`Failed to load linked lead-hunting sessions for ${rawPostId}: ${linksError.message}`);
    }

    const sessionIds = [...new Set((links ?? []).map((row) => row.search_session_id))];
    for (const sessionId of sessionIds) {
      const { data, error } = await this.supabase
        .from('lead_search_session_posts')
        .select('was_duplicate, raw_post:raw_posts(status)')
        .eq('search_session_id', sessionId);

      if (error) {
        throw new Error(`Failed to recalculate lead-hunting session ${sessionId}: ${error.message}`);
      }

      const rows = (data ?? []) as Array<{
        was_duplicate: boolean;
        raw_post?: { status?: string | null } | null;
      }>;
      const statuses = rows
        .map((row) => row.raw_post?.status ?? null)
        .filter((value): value is string => typeof value === 'string');

      const totals = {
        total_qualified: statuses.filter((status) => status === 'qualified_lead').length,
        total_needs_review: statuses.filter((status) => status === 'needs_review').length,
        total_archived: statuses.filter((status) => status === 'archived').length,
        total_rejected: statuses.filter((status) => status === 'rejected').length,
      };

      const allTerminal =
        statuses.length > 0 &&
        statuses.every((status) =>
          ['qualified_lead', 'needs_review', 'archived', 'rejected', 'failed', 'cancelled'].includes(status),
        );
      const sessionStatus = allTerminal ? 'completed' : 'researching';

      const { error: updateError } = await this.supabase
        .from('lead_search_sessions')
        .update({
          ...totals,
          status: sessionStatus,
        })
        .eq('id', sessionId);

      if (updateError) {
        throw new Error(`Failed to update lead-hunting session ${sessionId}: ${updateError.message}`);
      }
    }
  }

  private async loadRawPost(organizationId: string, rawPostId: string): Promise<RawPostRow> {
    const { data, error } = await this.supabase
      .from('raw_posts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', rawPostId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load raw post ${rawPostId}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`Raw post ${rawPostId} not found for organization ${organizationId}`);
    }
    return data as RawPostRow;
  }

  private async loadLatestReport(
    organizationId: string,
    rawPostId: string,
  ): Promise<PostResearchReportRow> {
    const { data, error } = await this.supabase
      .from('post_research_reports')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('raw_post_id', rawPostId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load research report for ${rawPostId}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`No research report found for raw post ${rawPostId}`);
    }
    return data as PostResearchReportRow;
  }

  private async loadLatestClassification(
    organizationId: string,
    rawPostId: string,
  ): Promise<LeadHuntingClassificationResult> {
    const { data, error } = await this.supabase
      .from('post_classifications')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('raw_post_id', rawPostId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load post classification for ${rawPostId}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`No post classification found for raw post ${rawPostId}`);
    }

    const row = data as PostClassificationRow;
    return {
      row,
      classifier: {
        classification: row.classification,
        isActualLead: row.is_actual_lead,
        urgency: coerceUrgency(row.urgency),
        serviceMatch: Array.isArray(row.service_match)
          ? (row.service_match as unknown as LeadHuntingClassificationResult['classifier']['serviceMatch'])
          : [],
        reasons: [],
        recommendedAction: row.recommended_action ?? 'Review this lead-hunting decision.',
        summary: summarizeReasons(row.reason_json) ?? 'Reused persisted lead-hunting classification.',
      },
      score: {
        leadScore: row.lead_score,
        leadQuality: (row.lead_quality as LeadHuntingClassificationResult['score']['leadQuality']) ?? 'low',
        reasons: [],
      },
      archive: await this.loadArchiveForRawPost(rawPostId),
      decision: determineLeadHuntingDecision({
        classification: row.classification,
        leadScore: row.lead_score,
        isActualLead: row.is_actual_lead,
      }),
    };
  }

  private async loadArchiveForRawPost(rawPostId: string) {
    const { data } = await this.supabase
      .from('archived_posts')
      .select('*')
      .eq('raw_post_id', rawPostId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      archiveCategory: data.archive_category,
      topic: data.topic,
      summary: data.summary ?? '',
      keywords: data.keywords ?? [],
      reasonForArchive: data.reason_for_archive ?? '',
      marketSignalScore: data.market_signal_score ?? 0,
    };
  }

  private async loadDiscoveryById(
    organizationId: string,
    discoveryId: string,
  ): Promise<DiscoveryRow | null> {
    const { data, error } = await this.supabase
      .from('discoveries')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', discoveryId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load discovery ${discoveryId}: ${error.message}`);
    }
    return (data as DiscoveryRow | null) ?? null;
  }

  private async loadDiscoveryByDedupHash(
    organizationId: string,
    dedupHash: string,
  ): Promise<DiscoveryRow | null> {
    const { data, error } = await this.supabase
      .from('discoveries')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('dedup_hash', dedupHash)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load discovery by dedup hash ${dedupHash}: ${error.message}`);
    }
    return (data as DiscoveryRow | null) ?? null;
  }

  private async loadLiveArchivedPost(rawPostId: string): Promise<ArchivedPostRow | null> {
    const { data, error } = await this.supabase
      .from('archived_posts')
      .select('*')
      .eq('raw_post_id', rawPostId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load archived post for ${rawPostId}: ${error.message}`);
    }
    return (data as ArchivedPostRow | null) ?? null;
  }
}
