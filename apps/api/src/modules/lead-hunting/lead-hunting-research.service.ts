import { Inject, Injectable } from '@nestjs/common';
import { QUEUES, type LeadHuntingResearchJobPayload } from '@radar/contracts';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { SupabaseQueueService } from '../../queue/supabase-queue.service';
import { AuditService } from '../audit/audit.service';
import { ExternalProviderOrchestratorService } from './external-provider-orchestrator.service';
import {
  canonicalHost,
  clampScore,
  firstMeaningfulLine,
  normalizeReportState,
  type LeadHuntingResearchReportState,
  type ManagementContact,
  type ResolvedCompany,
  type ResolvedCountry,
  type ResolvedEmail,
  type ResolvedManagement,
  type ResolvedPerson,
  type ResolvedWebsite,
  type ResearchStageSnapshot,
} from './lead-hunting-pipeline.types';
import { LeadHuntingClassificationService } from './lead-hunting-classification.service';
import { LeadHuntingCrmHandoffService } from './lead-hunting-crm-handoff.service';
import { LeadHuntingOperationsService } from './lead-hunting-operations.service';

type RawPostRow = Database['public']['Tables']['raw_posts']['Row'];
type RawPostUpdate = Database['public']['Tables']['raw_posts']['Update'];
type PostResearchJobRow = Database['public']['Tables']['post_research_jobs']['Row'];
type PostResearchReportRow = Database['public']['Tables']['post_research_reports']['Row'];
type LeadSearchSessionPostRow = Database['public']['Tables']['lead_search_session_posts']['Row'];
type MembershipRow = Database['public']['Tables']['memberships']['Row'];

const STAGE_PROGRESS: Record<PostResearchJobRow['current_stage'], number> = {
  dedupe: 0,
  linkedin_post_lookup: 10,
  linkedin_profile_lookup: 18,
  linkedin_company_lookup: 28,
  person_resolver: 38,
  company_resolver: 48,
  website_discovery: 58,
  website_crawl: 68,
  email_discovery: 78,
  management_discovery: 86,
  country_resolution: 92,
  evidence_building: 95,
  ai_classification: 97,
  decision_routing: 99,
};

const STAGE_CACHE_HOURS = 24 * 7;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LEADERSHIP_KEYWORDS = /(founder|co-?founder|ceo|cto|cmo|owner|director|head|vp|president|managing)/i;
const COUNTRY_PATTERNS: Array<{ pattern: RegExp; country: string }> = [
  { pattern: /\b(united states|usa|u\.s\.)\b/i, country: 'United States' },
  { pattern: /\b(india)\b/i, country: 'India' },
  { pattern: /\b(united kingdom|uk|u\.k\.)\b/i, country: 'United Kingdom' },
  { pattern: /\b(canada)\b/i, country: 'Canada' },
  { pattern: /\b(australia)\b/i, country: 'Australia' },
  { pattern: /\b(germany)\b/i, country: 'Germany' },
];
const COUNTRY_TLD_MAP: Record<string, string> = {
  in: 'India',
  uk: 'United Kingdom',
  de: 'Germany',
  au: 'Australia',
  ca: 'Canada',
};

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function stageIsFresh(snapshot: ResearchStageSnapshot | undefined, now = Date.now()): boolean {
  if (!snapshot?.completedAt) return false;
  const timestamp = Date.parse(snapshot.completedAt);
  if (Number.isNaN(timestamp)) return false;
  return now - timestamp <= STAGE_CACHE_HOURS * 60 * 60 * 1000;
}

function extractEmails(...values: Array<string | null | undefined>): string[] {
  const found: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const matches = value.match(EMAIL_REGEX) ?? [];
    for (const match of matches) {
      found.push(match.toLowerCase());
    }
  }
  return uniqueStrings(found);
}

function inferEmail(name: string | null, domain: string | null): string | null {
  if (!name || !domain) return null;
  const parts = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0]}.${parts[parts.length - 1]}@${domain}`;
}

function findPublicWebsite(text: string | null | undefined): string | null {
  if (!text) return null;
  const matches = text.match(/https?:\/\/[^\s)]+|(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s)]*)?/gi) ?? [];
  for (const match of matches) {
    const host = canonicalHost(match);
    if (!host || host.includes('linkedin.com')) continue;
    return `https://${host}`;
  }
  return null;
}

function publicWebsite(value: string | null | undefined): string | null {
  const host = canonicalHost(value);
  if (!host || host.includes('linkedin.com')) return null;
  return `https://${host}`;
}

function inferCountry(text: string | null | undefined, website: string | null): string | null {
  if (text) {
    for (const candidate of COUNTRY_PATTERNS) {
      if (candidate.pattern.test(text)) return candidate.country;
    }
  }

  const host = canonicalHost(website);
  if (!host) return null;
  const tld = host.split('.').pop() ?? '';
  return COUNTRY_TLD_MAP[tld] ?? null;
}

function summarizeManagement(contacts: ManagementContact[]): string | null {
  if (contacts.length === 0) return null;
  return contacts
    .slice(0, 3)
    .map((contact) => `${contact.name}${contact.title ? ` (${contact.title})` : ''}`)
    .join(', ');
}

function providerSummary(provider: string | null, fallbackLabel: string): string {
  return provider ? `provider:${provider}` : fallbackLabel;
}

@Injectable()
export class LeadHuntingResearchService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly queueService: SupabaseQueueService,
    private readonly providers: ExternalProviderOrchestratorService,
    private readonly classification: LeadHuntingClassificationService,
    private readonly handoff: LeadHuntingCrmHandoffService,
    private readonly operations: LeadHuntingOperationsService,
    private readonly audit: AuditService,
  ) {}

  async enqueueResearch(
    organizationId: string,
    rawPostId: string,
    actorUserId: string | null,
    options: { force?: boolean } = {},
  ): Promise<{ jobId: string; postResearchJobId: string }> {
    await this.operations.assertResearchAllowed(organizationId);
    const rawPost = await this.loadRawPost(organizationId, rawPostId);
    const postResearchJob = await this.ensureResearchJob(organizationId, rawPostId);
    const searchSessionId = rawPost.search_session_id ?? (await this.loadPrimarySearchSessionId(rawPostId));

    if (!searchSessionId) {
      throw new Error(`Raw post ${rawPostId} is not linked to a lead-hunting search session`);
    }

    const payload: LeadHuntingResearchJobPayload = {
      rawPostId,
      postResearchJobId: postResearchJob.id,
      searchSessionId,
      capturedBy: rawPost.captured_by_user_id,
      force: options.force ?? true,
      requestedBy: actorUserId,
    };

    const jobId = await this.queueService.enqueue(
      organizationId,
      QUEUES.researchRawPost,
      'research-raw-post',
      payload,
      'raw_post',
      rawPostId,
    );

    await this.updateResearchJob(postResearchJob.id, {
      job_run_id: jobId,
      status: 'queued',
      progress: 0,
      current_stage: 'dedupe',
      last_error: null,
      started_at: null,
      completed_at: null,
    });
    await this.updateRawPost(rawPostId, {
      status: 'queued_for_research',
      failure_reason: null,
    });
    if (actorUserId) {
      await this.audit.recordAction({
        organizationId,
        actorId: actorUserId,
        action: 'lead_hunting.post.research_enqueued',
        entityType: 'raw_post',
        entityId: rawPostId,
        after: { jobId, postResearchJobId: postResearchJob.id },
      });
    }

    return { jobId, postResearchJobId: postResearchJob.id };
  }

  async runQueuedResearch(job: {
    jobRunId: string;
    organizationId: string;
    payload: LeadHuntingResearchJobPayload;
  }): Promise<void> {
    const { jobRunId, organizationId, payload } = job;
    await this.operations.assertResearchAllowed(organizationId);
    const rawPost = await this.loadRawPost(organizationId, payload.rawPostId);
    const actorUserId = await this.resolveActorUserId(organizationId, payload.requestedBy ?? payload.capturedBy);
    const previousReport = await this.loadLatestReport(organizationId, rawPost.id).catch(() => null);
    const previousState = normalizeReportState(previousReport?.report_json);

    await this.markJobRun(jobRunId, {
      status: 'running',
      started_at: new Date().toISOString(),
      progress: 5,
      error: null,
    });
    await this.updateResearchJob(payload.postResearchJobId, {
      job_run_id: jobRunId,
      status: 'running',
      progress: 5,
      current_stage: 'linkedin_post_lookup',
      started_at: new Date().toISOString(),
      last_error: null,
    });
    await this.updateRawPost(rawPost.id, {
      status: 'researching',
      failure_reason: null,
    });

    const state: LeadHuntingResearchReportState = {
      ...previousState,
      schemaVersion: 1,
      stages: { ...(previousState.stages ?? {}) },
      notes: [...(previousState.notes ?? [])],
    };

    try {
      const postLookup = await this.resolveLinkedinPost(job, rawPost, state, payload.force === true);
      const profileLookup = await this.resolveLinkedinProfile(job, rawPost, state, payload.force === true);
      await this.enterStage(job, job.payload.postResearchJobId, 'person_resolver');
      state.person = await this.resolvePerson(rawPost, profileLookup, state, payload.force === true);
      await this.updateRawPost(rawPost.id, { status: 'person_resolved' });

      const companyLookup = await this.resolveLinkedinCompany(job, rawPost, state, payload.force === true);
      await this.enterStage(job, job.payload.postResearchJobId, 'company_resolver');
      state.company = await this.resolveCompany(rawPost, companyLookup, state, payload.force === true);
      await this.updateRawPost(rawPost.id, { status: 'company_resolved' });

      await this.enterStage(job, job.payload.postResearchJobId, 'website_discovery');
      state.website = await this.resolveWebsite(rawPost, state.company, state, payload.force === true);
      await this.updateRawPost(rawPost.id, { status: 'website_found' });

      state.website = await this.resolveWebsiteResearch(job, rawPost, state.website, state, payload.force === true);
      await this.updateRawPost(rawPost.id, { status: 'website_researched' });

      await this.enterStage(job, job.payload.postResearchJobId, 'email_discovery');
      state.email = await this.resolveEmail(rawPost, state.person, state.website, state, payload.force === true);
      await this.updateRawPost(rawPost.id, { status: 'email_checked' });

      await this.enterStage(job, job.payload.postResearchJobId, 'management_discovery');
      state.management = await this.resolveManagement(rawPost, state.person, state, payload.force === true);
      await this.updateRawPost(rawPost.id, { status: 'management_found' });

      await this.enterStage(job, job.payload.postResearchJobId, 'country_resolution');
      state.country = await this.resolveCountry(rawPost, state.company, state.website, state, payload.force === true);
      await this.updateRawPost(rawPost.id, { status: 'country_resolved' });

      const canonical = await this.resolveCanonicalEntities(organizationId, actorUserId, rawPost, state);
      const report = await this.persistReport({
        organizationId,
        rawPost,
        state,
        previousReport,
        canonical,
      });
      await this.updateResearchJob(payload.postResearchJobId, {
        current_stage: 'evidence_building',
        progress: STAGE_PROGRESS.evidence_building,
      });
      await this.updateRawPost(rawPost.id, { status: 'evidence_built' });
      await this.markJobRun(jobRunId, { progress: STAGE_PROGRESS.evidence_building });

      await this.updateResearchJob(payload.postResearchJobId, {
        current_stage: 'ai_classification',
        progress: STAGE_PROGRESS.ai_classification,
      });
      await this.markJobRun(jobRunId, { progress: STAGE_PROGRESS.ai_classification });

      const classified = await this.classification.classifyRawPost(
        organizationId,
        rawPost,
        report,
        actorUserId,
      );
      await this.updateRawPost(rawPost.id, { status: 'ai_classified' });

      await this.updateResearchJob(payload.postResearchJobId, {
        current_stage: 'decision_routing',
        progress: STAGE_PROGRESS.decision_routing,
      });
      await this.markJobRun(jobRunId, { progress: STAGE_PROGRESS.decision_routing });

      const routed = await this.handoff.routeClassification({
        organizationId,
        rawPost,
        report,
        classification: classified,
        actorUserId,
      });

      await this.updateResearchJob(payload.postResearchJobId, {
        status: 'completed',
        progress: 100,
        completed_at: new Date().toISOString(),
      });
      await this.markJobRun(jobRunId, {
        progress: 100,
        result: toJson({
          rawPostId: rawPost.id,
          reportId: report.id,
          classificationId: classified.row.id,
          decision: routed.decision,
          discoveryId: routed.discoveryId,
          archivedPostId: routed.archivedPostId,
          providerPostLookup: postLookup,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown lead-hunting research failure';
      await this.updateResearchJob(payload.postResearchJobId, {
        status: 'failed',
        last_error: message,
        completed_at: new Date().toISOString(),
      });
      await this.updateRawPost(rawPost.id, {
        status: 'failed',
        failure_reason: message,
      });
      await this.markJobRun(jobRunId, {
        status: 'failed',
        error: message,
      });
      throw error;
    }
  }

  async reclassifyRawPost(
    organizationId: string,
    rawPostId: string,
    actorUserId: string,
  ): Promise<{ classificationId: string; decision: string; discoveryId: string | null }> {
    const rawPost = await this.loadRawPost(organizationId, rawPostId);
    const report = await this.loadLatestReport(organizationId, rawPostId);
    const classified = await this.classification.classifyRawPost(organizationId, rawPost, report, actorUserId);
    const routed = await this.handoff.routeClassification({
      organizationId,
      rawPost,
      report,
      classification: classified,
      actorUserId,
    });
    await this.audit.recordAction({
      organizationId,
      actorId: actorUserId,
      action: 'lead_hunting.post.classified',
      entityType: 'raw_post',
      entityId: rawPostId,
      after: {
        classificationId: classified.row.id,
        decision: routed.decision,
        discoveryId: routed.discoveryId,
      },
    });
    return {
      classificationId: classified.row.id,
      decision: routed.decision,
      discoveryId: routed.discoveryId,
    };
  }

  private async resolveLinkedinPost(
    job: { organizationId: string; payload: LeadHuntingResearchJobPayload; jobRunId: string },
    rawPost: RawPostRow,
    state: LeadHuntingResearchReportState,
    force: boolean,
  ): Promise<{ provider: string | null; status: string; summary: string | null }> {
    await this.enterStage(job, job.payload.postResearchJobId, 'linkedin_post_lookup');

    const cached = state.stages.linkedin_post_lookup;
    if (!force && stageIsFresh(cached)) {
      state.stages.linkedin_post_lookup = {
        ...cached,
        cached: true,
      };
      return {
        provider: cached?.sourceProvider ?? null,
        status: 'cached',
        summary: asString((cached?.data as Record<string, unknown> | undefined)?.summary),
      };
    }

    let provider: string | null = null;
    let status = 'manual';
    let summary = firstMeaningfulLine(rawPost.post_text) ?? rawPost.media_text ?? null;

    try {
      const result = await this.providers.execute<Record<string, unknown>, Record<string, unknown>>({
        organizationId: job.organizationId,
        userId: job.payload.requestedBy ?? job.payload.capturedBy ?? undefined,
        taskType: 'linkedin_post_lookup',
        rawPostId: rawPost.id,
        searchSessionId: job.payload.searchSessionId,
        postResearchJobId: job.payload.postResearchJobId,
        jobRunId: job.jobRunId,
        entityType: 'raw_post',
        entityId: rawPost.id,
        request: {
          postUrl: rawPost.post_url,
          ownerProfileUrl: rawPost.post_owner_profile_url,
          companyUrl: rawPost.visible_company_url,
          postText: rawPost.post_text,
        },
      });

      if (result.kind === 'success') {
        provider = result.provider;
        status = result.status;
        summary = asString(result.response.summary) ?? summary;
      } else {
        state.notes?.push(`linkedin_post_lookup fallback: ${result.reason}`);
      }
    } catch (error) {
      state.notes?.push(
        `linkedin_post_lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    state.stages.linkedin_post_lookup = {
      completedAt: new Date().toISOString(),
      cached: false,
      sourceProvider: provider,
      sourceType: providerSummary(provider, 'visible_payload'),
      sourceUrl: rawPost.post_url,
      data: toJson({ summary }),
    };

    await this.updateRawPost(rawPost.id, { status: 'provider_post_enriched' });
    await this.writeEvidence(rawPost.id, 'post_summary', summary, {
      sourceProvider: provider,
      sourceType: providerSummary(provider, 'visible_payload'),
      sourceUrl: rawPost.post_url,
      confidenceScore: provider ? 80 : 55,
      evidenceText: summary,
      evidenceJson: state.stages.linkedin_post_lookup.data ?? {},
    });

    return { provider, status, summary };
  }

  private async resolveLinkedinProfile(
    job: { organizationId: string; payload: LeadHuntingResearchJobPayload; jobRunId: string },
    rawPost: RawPostRow,
    state: LeadHuntingResearchReportState,
    force: boolean,
  ): Promise<Record<string, unknown> | null> {
    await this.enterStage(job, job.payload.postResearchJobId, 'linkedin_profile_lookup');
    const cached = state.stages.linkedin_profile_lookup;
    if (!force && stageIsFresh(cached) && isRecord(cached?.data)) {
      state.stages.linkedin_profile_lookup = { ...cached, cached: true };
      return cached?.data as Record<string, unknown>;
    }

    let provider: string | null = null;
    let response: Record<string, unknown> | null = null;

    try {
      const result = await this.providers.execute<Record<string, unknown>, Record<string, unknown>>({
        organizationId: job.organizationId,
        userId: job.payload.requestedBy ?? job.payload.capturedBy ?? undefined,
        taskType: 'linkedin_profile_lookup',
        rawPostId: rawPost.id,
        searchSessionId: job.payload.searchSessionId,
        postResearchJobId: job.payload.postResearchJobId,
        jobRunId: job.jobRunId,
        entityType: 'raw_post',
        entityId: rawPost.id,
        request: {
          profileUrl: rawPost.post_owner_profile_url,
          profileName: rawPost.post_owner_name,
        },
      });

      if (result.kind === 'success' && isRecord(result.response)) {
        provider = result.provider;
        response = result.response;
      } else if (result.kind === 'manual_fallback') {
        state.notes?.push(`linkedin_profile_lookup fallback: ${result.reason}`);
      }
    } catch (error) {
      state.notes?.push(
        `linkedin_profile_lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    state.stages.linkedin_profile_lookup = {
      completedAt: new Date().toISOString(),
      cached: false,
      sourceProvider: provider,
      sourceType: providerSummary(provider, 'visible_payload'),
      sourceUrl: rawPost.post_owner_profile_url,
      data: toJson(response ?? {}),
    };

    return response;
  }

  private async resolveLinkedinCompany(
    job: { organizationId: string; payload: LeadHuntingResearchJobPayload; jobRunId: string },
    rawPost: RawPostRow,
    state: LeadHuntingResearchReportState,
    force: boolean,
  ): Promise<Record<string, unknown> | null> {
    await this.enterStage(job, job.payload.postResearchJobId, 'linkedin_company_lookup');
    const cached = state.stages.linkedin_company_lookup;
    if (!force && stageIsFresh(cached) && isRecord(cached?.data)) {
      state.stages.linkedin_company_lookup = { ...cached, cached: true };
      return cached?.data as Record<string, unknown>;
    }

    let provider: string | null = null;
    let response: Record<string, unknown> | null = null;

    try {
      const result = await this.providers.execute<Record<string, unknown>, Record<string, unknown>>({
        organizationId: job.organizationId,
        userId: job.payload.requestedBy ?? job.payload.capturedBy ?? undefined,
        taskType: 'linkedin_company_lookup',
        rawPostId: rawPost.id,
        searchSessionId: job.payload.searchSessionId,
        postResearchJobId: job.payload.postResearchJobId,
        jobRunId: job.jobRunId,
        entityType: 'raw_post',
        entityId: rawPost.id,
        request: {
          companyUrl: rawPost.visible_company_url,
          companyName: rawPost.visible_company_name,
        },
      });

      if (result.kind === 'success' && isRecord(result.response)) {
        provider = result.provider;
        response = result.response;
      } else if (result.kind === 'manual_fallback') {
        state.notes?.push(`linkedin_company_lookup fallback: ${result.reason}`);
      }
    } catch (error) {
      state.notes?.push(
        `linkedin_company_lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    state.stages.linkedin_company_lookup = {
      completedAt: new Date().toISOString(),
      cached: false,
      sourceProvider: provider,
      sourceType: providerSummary(provider, 'visible_payload'),
      sourceUrl: rawPost.visible_company_url,
      data: toJson(response ?? {}),
    };

    return response;
  }

  private async resolvePerson(
    rawPost: RawPostRow,
    providerResponse: Record<string, unknown> | null,
    state: LeadHuntingResearchReportState,
    force: boolean,
  ): Promise<ResolvedPerson> {
    const cached = state.person;
    if (!force && cached && stageIsFresh(state.stages.person_resolver)) {
      state.stages.person_resolver = {
        ...state.stages.person_resolver,
        cached: true,
      };
      return cached;
    }

    const name = asString(providerResponse?.name) ?? rawPost.post_owner_name;
    const headline = asString(providerResponse?.headline) ?? rawPost.post_owner_headline;
    const linkedinUrl = asString(providerResponse?.linkedinUrl) ?? rawPost.post_owner_profile_url;
    const confidence = clampScore(
      asNumber(providerResponse?.confidence) ?? (name ? 88 : 40),
      name ? 88 : 40,
    );
    const summary = name
      ? `${name}${headline ? `, ${headline}` : ''}${linkedinUrl ? ' (LinkedIn profile captured)' : ''}`
      : 'No clear person identity was resolved from the visible LinkedIn payload.';

    state.stages.person_resolver = {
      completedAt: new Date().toISOString(),
      cached: false,
      sourceProvider: state.stages.linkedin_profile_lookup?.sourceProvider ?? null,
      sourceType: providerSummary(state.stages.linkedin_profile_lookup?.sourceProvider ?? null, 'visible_payload'),
      sourceUrl: linkedinUrl,
      data: toJson({ name, headline, linkedinUrl, summary }),
    };

    await this.writeEvidence(rawPost.id, 'person_name', name, {
      sourceProvider: state.stages.person_resolver.sourceProvider ?? null,
      sourceType: state.stages.person_resolver.sourceType ?? null,
      sourceUrl: linkedinUrl,
      confidenceScore: confidence,
      evidenceText: summary,
      evidenceJson: state.stages.person_resolver.data ?? {},
    });

    return { name, headline, linkedinUrl, confidence, summary };
  }

  private async resolveCompany(
    rawPost: RawPostRow,
    providerResponse: Record<string, unknown> | null,
    state: LeadHuntingResearchReportState,
    force: boolean,
  ): Promise<ResolvedCompany> {
    const cached = state.company;
    if (!force && cached && stageIsFresh(state.stages.company_resolver)) {
      state.stages.company_resolver = {
        ...state.stages.company_resolver,
        cached: true,
      };
      return cached;
    }

    const providerWebsite =
      asString(providerResponse?.website) ??
      asString(providerResponse?.domain) ??
      findPublicWebsite(rawPost.post_text);
    const website = publicWebsite(providerWebsite);
    const domain = canonicalHost(website);
    const name = asString(providerResponse?.name) ?? rawPost.visible_company_name;
    const country = asString(providerResponse?.country) ?? inferCountry(rawPost.post_text, website);
    const linkedinUrl = rawPost.visible_company_url;
    const confidence = clampScore(asNumber(providerResponse?.confidence) ?? (name ? 84 : 35), name ? 84 : 35);
    const summary = name
      ? `${name}${website ? ` appears to use ${website}` : ''}${country ? ` and is likely based in ${country}` : ''}.`
      : 'No clear company identity was resolved from the visible LinkedIn payload.';

    state.stages.company_resolver = {
      completedAt: new Date().toISOString(),
      cached: false,
      sourceProvider: state.stages.linkedin_company_lookup?.sourceProvider ?? null,
      sourceType: providerSummary(state.stages.linkedin_company_lookup?.sourceProvider ?? null, 'visible_payload'),
      sourceUrl: linkedinUrl,
      data: toJson({ name, website, domain, country, summary }),
    };

    await this.writeEvidence(rawPost.id, 'company_name', name, {
      sourceProvider: state.stages.company_resolver.sourceProvider ?? null,
      sourceType: state.stages.company_resolver.sourceType ?? null,
      sourceUrl: linkedinUrl,
      confidenceScore: confidence,
      evidenceText: summary,
      evidenceJson: state.stages.company_resolver.data ?? {},
    });

    return { name, linkedinUrl, website, domain, country, confidence, summary };
  }

  private async resolveWebsite(
    rawPost: RawPostRow,
    company: ResolvedCompany | undefined,
    state: LeadHuntingResearchReportState,
    force: boolean,
  ): Promise<ResolvedWebsite> {
    const cached = state.website;
    if (!force && cached && stageIsFresh(state.stages.website_discovery)) {
      state.stages.website_discovery = {
        ...state.stages.website_discovery,
        cached: true,
      };
      return cached;
    }

    const direct = publicWebsite(company?.website ?? rawPost.visible_company_url);
    const discovered = direct ?? findPublicWebsite(rawPost.post_text) ?? null;
    const domain = canonicalHost(discovered);
    const confidence = discovered ? (direct ? 90 : 62) : 20;
    const summary = discovered
      ? `Public website resolved as ${discovered}.`
      : 'No public company website could be confirmed from the visible payload.';

    state.stages.website_discovery = {
      completedAt: new Date().toISOString(),
      cached: false,
      sourceProvider: null,
      sourceType: direct ? 'company_hint' : 'text_inference',
      sourceUrl: discovered,
      data: toJson({ url: discovered, domain, summary }),
    };

    await this.writeEvidence(rawPost.id, 'website', discovered, {
      sourceProvider: null,
      sourceType: state.stages.website_discovery.sourceType ?? null,
      sourceUrl: discovered,
      confidenceScore: confidence,
      evidenceText: summary,
      evidenceJson: state.stages.website_discovery.data ?? {},
    });

    return { url: discovered, domain, confidence, summary };
  }

  private async resolveWebsiteResearch(
    job: { organizationId: string; payload: LeadHuntingResearchJobPayload; jobRunId: string },
    rawPost: RawPostRow,
    website: ResolvedWebsite,
    state: LeadHuntingResearchReportState,
    force: boolean,
  ): Promise<ResolvedWebsite> {
    await this.enterStage(job, job.payload.postResearchJobId, 'website_crawl');
    if (!website.url) {
      state.stages.website_crawl = {
        completedAt: new Date().toISOString(),
        cached: false,
        sourceProvider: null,
        sourceType: 'not_available',
        sourceUrl: null,
        data: toJson({ summary: 'Website crawl skipped because no website was discovered.' }),
      };
      return {
        ...website,
        summary: 'Website crawl skipped because no website was discovered.',
      };
    }

    if (!force && stageIsFresh(state.stages.website_crawl)) {
      state.stages.website_crawl = {
        ...state.stages.website_crawl,
        cached: true,
      };
      return {
        ...website,
        summary:
          asString((state.stages.website_crawl.data as Record<string, unknown> | undefined)?.summary) ??
          website.summary,
      };
    }

    let provider: string | null = null;
    let summary = `Website available at ${website.url}; deep crawl was not available in this run.`;
    try {
      const result = await this.providers.execute<Record<string, unknown>, Record<string, unknown>>({
        organizationId: job.organizationId,
        userId: job.payload.requestedBy ?? job.payload.capturedBy ?? undefined,
        taskType: 'website_crawl',
        rawPostId: rawPost.id,
        searchSessionId: job.payload.searchSessionId,
        postResearchJobId: job.payload.postResearchJobId,
        jobRunId: job.jobRunId,
        entityType: 'raw_post',
        entityId: rawPost.id,
        request: { url: website.url, domain: website.domain, companyName: state.company?.name },
      });

      if (result.kind === 'success') {
        provider = result.provider;
        summary = asString(result.response.summary) ?? summary;
      } else {
        state.notes?.push(`website_crawl fallback: ${result.reason}`);
      }
    } catch (error) {
      state.notes?.push(`website_crawl failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    state.stages.website_crawl = {
      completedAt: new Date().toISOString(),
      cached: false,
      sourceProvider: provider,
      sourceType: providerSummary(provider, 'public_website'),
      sourceUrl: website.url,
      data: toJson({ summary }),
    };

    await this.writeEvidence(rawPost.id, 'website_summary', summary, {
      sourceProvider: provider,
      sourceType: state.stages.website_crawl.sourceType ?? null,
      sourceUrl: website.url,
      confidenceScore: provider ? 75 : 55,
      evidenceText: summary,
      evidenceJson: state.stages.website_crawl.data ?? {},
    });

    return { ...website, summary };
  }

  private async resolveEmail(
    rawPost: RawPostRow,
    person: ResolvedPerson | undefined,
    website: ResolvedWebsite | undefined,
    state: LeadHuntingResearchReportState,
    force: boolean,
  ): Promise<ResolvedEmail> {
    const cached = state.email;
    if (!force && cached && stageIsFresh(state.stages.email_discovery)) {
      state.stages.email_discovery = {
        ...state.stages.email_discovery,
        cached: true,
      };
      return cached;
    }

    const explicit = extractEmails(rawPost.post_text, rawPost.media_text)[0] ?? null;
    const inferred = explicit ? null : inferEmail(person?.name ?? null, website?.domain ?? null);
    const email = explicit ?? inferred;
    const source: ResolvedEmail['source'] = explicit ? 'explicit' : inferred ? 'inferred' : 'none';
    const confidence = explicit ? 95 : inferred ? 34 : 0;
    const summary =
      source === 'explicit'
        ? `Explicit public email found: ${email}.`
        : source === 'inferred'
          ? `Inferred email pattern candidate: ${email}. Manual verification required.`
          : 'No email was discovered from the visible payload or verified website hints.';

    state.stages.email_discovery = {
      completedAt: new Date().toISOString(),
      cached: false,
      sourceProvider: null,
      sourceType: source,
      sourceUrl: website?.url ?? null,
      data: toJson({ email, source, summary }),
    };

    await this.writeEvidence(rawPost.id, 'email', email, {
      sourceProvider: null,
      sourceType: source,
      sourceUrl: website?.url ?? null,
      confidenceScore: confidence,
      evidenceText: summary,
      evidenceJson: state.stages.email_discovery.data ?? {},
    });

    return { email, confidence, source, summary };
  }

  private async resolveManagement(
    rawPost: RawPostRow,
    person: ResolvedPerson | undefined,
    state: LeadHuntingResearchReportState,
    force: boolean,
  ): Promise<ResolvedManagement> {
    const cached = state.management;
    if (!force && cached && stageIsFresh(state.stages.management_discovery)) {
      state.stages.management_discovery = {
        ...state.stages.management_discovery,
        cached: true,
      };
      return cached;
    }

    const contacts: ManagementContact[] =
      person?.name && LEADERSHIP_KEYWORDS.test(person.headline ?? '')
        ? [{ name: person.name, title: person.headline, sourceUrl: person.linkedinUrl }]
        : [];
    const summary =
      contacts.length > 0
        ? `Leadership-style contact observed: ${summarizeManagement(contacts)}.`
        : 'No management contacts were confidently identified from the visible payload.';

    state.stages.management_discovery = {
      completedAt: new Date().toISOString(),
      cached: false,
      sourceProvider: null,
      sourceType: 'visible_payload',
      sourceUrl: person?.linkedinUrl ?? null,
      data: toJson({ contacts, summary }),
    };
    const managementStage = state.stages.management_discovery;

    await this.writeEvidence(rawPost.id, 'management_contacts', summarizeManagement(contacts), {
      sourceProvider: managementStage.sourceProvider ?? null,
      sourceType: managementStage.sourceType ?? null,
      sourceUrl: person?.linkedinUrl ?? null,
      confidenceScore: contacts.length > 0 ? 72 : 0,
      evidenceText: summary,
      evidenceJson: managementStage.data ?? {},
    });

    return {
      contacts,
      confidence: contacts.length > 0 ? 72 : 0,
      summary,
    };
  }

  private async resolveCountry(
    rawPost: RawPostRow,
    company: ResolvedCompany | undefined,
    website: ResolvedWebsite | undefined,
    state: LeadHuntingResearchReportState,
    force: boolean,
  ): Promise<ResolvedCountry> {
    const cached = state.country;
    if (!force && cached && stageIsFresh(state.stages.country_resolution)) {
      state.stages.country_resolution = {
        ...state.stages.country_resolution,
        cached: true,
      };
      return cached;
    }

    const country = company?.country ?? inferCountry(rawPost.post_text, website?.url ?? null);
    const confidence = country ? (company?.country ? 85 : 55) : 0;
    const summary = country
      ? `Likely operating country resolved as ${country}.`
      : 'No country could be inferred with confidence from the visible payload.';

    state.stages.country_resolution = {
      completedAt: new Date().toISOString(),
      cached: false,
      sourceProvider: null,
      sourceType: company?.country ? 'company_hint' : 'text_or_tld_inference',
      sourceUrl: website?.url ?? null,
      data: toJson({ country, summary }),
    };

    await this.writeEvidence(rawPost.id, 'country', country, {
      sourceProvider: null,
      sourceType: state.stages.country_resolution.sourceType ?? null,
      sourceUrl: website?.url ?? null,
      confidenceScore: confidence,
      evidenceText: summary,
      evidenceJson: state.stages.country_resolution.data ?? {},
    });

    return { country, confidence, summary };
  }

  private async resolveCanonicalEntities(
    organizationId: string,
    actorUserId: string,
    rawPost: RawPostRow,
    state: LeadHuntingResearchReportState,
  ): Promise<{
    primaryCompanyId: string | null;
    primaryContactId: string | null;
  }> {
    const company =
      state.company && state.company.confidence >= 70
        ? await this.handoff.ensureCompany(
            organizationId,
            state.company.name,
            state.company.domain,
            state.country?.country ?? state.company.country,
            actorUserId,
          )
        : null;

    const contact =
      state.person && state.person.confidence >= 70
        ? await this.handoff.ensureContact(
            organizationId,
            state.person.name,
            company?.id ?? null,
            state.email?.source === 'explicit' ? state.email.email : null,
            state.person.headline,
            state.person.linkedinUrl,
            actorUserId,
          )
        : null;

    if (company) {
      await this.writeEvidence(rawPost.id, 'canonical_company_id', company.id, {
        sourceProvider: null,
        sourceType: 'm7_upsert',
        sourceUrl: state.company?.linkedinUrl ?? null,
        confidenceScore: state.company?.confidence ?? 0,
        evidenceText: `Promoted research company evidence into canonical company ${company.id}.`,
        evidenceJson: { companyId: company.id },
      });
    }

    if (contact) {
      await this.writeEvidence(rawPost.id, 'canonical_contact_id', contact.id, {
        sourceProvider: null,
        sourceType: 'm7_upsert',
        sourceUrl: state.person?.linkedinUrl ?? null,
        confidenceScore: state.person?.confidence ?? 0,
        evidenceText: `Promoted research person evidence into canonical contact ${contact.id}.`,
        evidenceJson: { contactId: contact.id },
      });
    }

    return {
      primaryCompanyId: company?.id ?? null,
      primaryContactId: contact?.id ?? null,
    };
  }

  private async persistReport(input: {
    organizationId: string;
    rawPost: RawPostRow;
    state: LeadHuntingResearchReportState;
    previousReport: PostResearchReportRow | null;
    canonical: {
      primaryCompanyId: string | null;
      primaryContactId: string | null;
    };
  }): Promise<PostResearchReportRow> {
    const opportunitySummary = uniqueStrings([
      firstMeaningfulLine(input.rawPost.post_text),
      input.state.company?.name ? `${input.state.company.name} mentioned in the visible post.` : null,
      input.state.person?.name ? `Primary visible contact: ${input.state.person.name}.` : null,
      input.state.email?.email
        ? `${input.state.email.source === 'explicit' ? 'Public' : 'Inferred'} email: ${input.state.email.email}.`
        : null,
    ]).join(' ');

    const confidenceScore = Math.round(
      (
        clampScore(input.state.person?.confidence, 0) +
        clampScore(input.state.company?.confidence, 0) +
        clampScore(input.state.website?.confidence, 0) +
        clampScore(input.state.email?.confidence, 0) +
        clampScore(input.state.management?.confidence, 0) +
        clampScore(input.state.country?.confidence, 0)
      ) / 6,
    );

    const payload: Database['public']['Tables']['post_research_reports']['Insert'] = {
      organization_id: input.organizationId,
      raw_post_id: input.rawPost.id,
      person_summary: input.state.person?.summary ?? null,
      company_summary: input.state.company?.summary ?? null,
      website_summary: input.state.website?.summary ?? null,
      email_summary: input.state.email?.summary ?? null,
      management_summary: input.state.management?.summary ?? null,
      country_summary: input.state.country?.summary ?? null,
      opportunity_summary: opportunitySummary || input.previousReport?.opportunity_summary || null,
      primary_contact_id: input.canonical.primaryContactId,
      primary_company_id: input.canonical.primaryCompanyId,
      target_company_id: input.canonical.primaryCompanyId,
      confidence_score: confidenceScore,
      report_json: toJson(input.state),
    };

    const { data, error } = await this.supabase
      .from('post_research_reports')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to persist post research report for ${input.rawPost.id}: ${error?.message ?? 'unknown error'}`);
    }

    return data as PostResearchReportRow;
  }

  private async writeEvidence(
    rawPostId: string,
    fieldName: string,
    fieldValue: string | null | undefined,
    input: {
      sourceProvider: string | null;
      sourceType: string | null;
      sourceUrl: string | null;
      confidenceScore: number | null;
      evidenceText: string | null;
      evidenceJson: unknown;
    },
  ): Promise<void> {
    const payload: Database['public']['Tables']['field_evidence_logs']['Insert'] = {
      organization_id: (await this.loadRawPostById(rawPostId)).organization_id,
      entity_type: 'raw_post',
      entity_id: rawPostId,
      raw_post_id: rawPostId,
      field_name: fieldName,
      field_value: fieldValue ?? null,
      source_provider: input.sourceProvider,
      source_type: input.sourceType,
      source_url: input.sourceUrl,
      confidence_score: input.confidenceScore,
      evidence_text: input.evidenceText,
      evidence_json: toJson(input.evidenceJson),
    };

    const { error } = await this.supabase.from('field_evidence_logs').insert(payload);
    if (error) {
      throw new Error(`Failed to write field evidence for ${rawPostId}/${fieldName}: ${error.message}`);
    }
  }

  private async enterStage(
    job: { organizationId: string; payload: LeadHuntingResearchJobPayload; jobRunId: string },
    postResearchJobId: string,
    stage: PostResearchJobRow['current_stage'],
  ): Promise<void> {
    await this.updateResearchJob(postResearchJobId, {
      current_stage: stage,
      progress: STAGE_PROGRESS[stage],
    });
    await this.markJobRun(job.jobRunId, { progress: STAGE_PROGRESS[stage] });
  }

  private async ensureResearchJob(
    organizationId: string,
    rawPostId: string,
  ): Promise<PostResearchJobRow> {
    const { data: existing, error: lookupError } = await this.supabase
      .from('post_research_jobs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('raw_post_id', rawPostId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Failed to load post research job for ${rawPostId}: ${lookupError.message}`);
    }
    if (existing) return existing as PostResearchJobRow;

    const { data, error } = await this.supabase
      .from('post_research_jobs')
      .insert({
        organization_id: organizationId,
        raw_post_id: rawPostId,
        current_stage: 'dedupe',
        status: 'queued',
        progress: 0,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create post research job for ${rawPostId}: ${error?.message ?? 'unknown error'}`);
    }

    return data as PostResearchJobRow;
  }

  private async resolveActorUserId(
    organizationId: string,
    preferredUserId: string | null,
  ): Promise<string> {
    if (preferredUserId) return preferredUserId;

    const { data, error } = await this.supabase
      .from('memberships')
      .select('user_id, created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to resolve an actor for lead-hunting AI calls: ${error.message}`);
    }
    if (!data) {
      throw new Error(`No active member could be resolved for organization ${organizationId}`);
    }

    return (data as Pick<MembershipRow, 'user_id'>).user_id;
  }

  private async loadPrimarySearchSessionId(rawPostId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('lead_search_session_posts')
      .select('search_session_id')
      .eq('raw_post_id', rawPostId)
      .order('capture_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to resolve a lead-hunting search session for ${rawPostId}: ${error.message}`);
    }

    return (data as Pick<LeadSearchSessionPostRow, 'search_session_id'> | null)?.search_session_id ?? null;
  }

  private async loadRawPost(organizationId: string, rawPostId: string): Promise<RawPostRow> {
    const row = await this.loadRawPostById(rawPostId);
    if (row.organization_id !== organizationId) {
      throw new Error(`Raw post ${rawPostId} does not belong to organization ${organizationId}`);
    }
    return row;
  }

  private async loadRawPostById(rawPostId: string): Promise<RawPostRow> {
    const { data, error } = await this.supabase
      .from('raw_posts')
      .select('*')
      .eq('id', rawPostId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load raw post ${rawPostId}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`Raw post ${rawPostId} not found`);
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
      throw new Error(`Failed to load post research report for ${rawPostId}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`No post research report found for ${rawPostId}`);
    }

    return data as PostResearchReportRow;
  }

  private async updateResearchJob(
    postResearchJobId: string,
    patch: Database['public']['Tables']['post_research_jobs']['Update'],
  ): Promise<void> {
    const { error } = await this.supabase.from('post_research_jobs').update(patch).eq('id', postResearchJobId);
    if (error) {
      throw new Error(`Failed to update post research job ${postResearchJobId}: ${error.message}`);
    }
  }

  private async updateRawPost(rawPostId: string, patch: RawPostUpdate): Promise<void> {
    const { error } = await this.supabase.from('raw_posts').update(patch).eq('id', rawPostId);
    if (error) {
      throw new Error(`Failed to update raw post ${rawPostId}: ${error.message}`);
    }
  }

  private async markJobRun(
    jobRunId: string,
    patch: Database['public']['Tables']['job_runs']['Update'],
  ): Promise<void> {
    const { error } = await this.supabase.from('job_runs').update(patch).eq('id', jobRunId);
    if (error) {
      throw new Error(`Failed to update lead-hunting job_run ${jobRunId}: ${error.message}`);
    }
  }
}
