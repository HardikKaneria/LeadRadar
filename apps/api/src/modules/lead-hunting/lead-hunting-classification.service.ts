import { Inject, Injectable } from '@nestjs/common';
import {
  classifyArchivedLeadHuntingPost,
  classifyLeadHuntingPost,
  scoreLeadHuntingPost,
  type AiCallRecord,
  type LeadHuntingArchiveOutput,
  type LeadHuntingClassifierOutput,
  type LeadHuntingResearchInput,
  type LeadHuntingScoreOutput,
} from '@radar/ai';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AiProviderPoolService } from '../ai/ai-provider-pool.service';
import { mapCompanyProfile } from '../ai/opportunity-analyzer.service';
import {
  determineLeadHuntingDecision,
  type LeadHuntingRouteDecision,
} from './lead-hunting-pipeline.types';

type RawPostRow = Database['public']['Tables']['raw_posts']['Row'];
type PostResearchReportRow = Database['public']['Tables']['post_research_reports']['Row'];
type PostClassificationRow = Database['public']['Tables']['post_classifications']['Row'];
type CompanyProfileRow = Database['public']['Tables']['company_profiles']['Row'];

export interface LeadHuntingClassificationResult {
  row: PostClassificationRow;
  classifier: LeadHuntingClassifierOutput;
  score: LeadHuntingScoreOutput;
  archive: LeadHuntingArchiveOutput | null;
  decision: LeadHuntingRouteDecision;
}

function truncate(value: string | null | undefined, max = 1800): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function buildInput(
  rawPost: RawPostRow,
  report: PostResearchReportRow,
): LeadHuntingResearchInput {
  return {
    postUrl: rawPost.post_url,
    postText: truncate(rawPost.post_text, 4000),
    mediaText: truncate(rawPost.media_text, 1200),
    ownerName: rawPost.post_owner_name,
    ownerHeadline: rawPost.post_owner_headline,
    ownerProfileUrl: rawPost.post_owner_profile_url,
    visibleCompanyName: rawPost.visible_company_name,
    visibleCompanyUrl: rawPost.visible_company_url,
    postDate: rawPost.post_date,
    personSummary: report.person_summary,
    companySummary: report.company_summary,
    websiteSummary: report.website_summary,
    emailSummary: report.email_summary,
    managementSummary: report.management_summary,
    countrySummary: report.country_summary,
    opportunitySummary: report.opportunity_summary,
    researchConfidence: report.confidence_score,
    profile: {
      services: [],
      priorityServices: [],
      targetIndustries: [],
      targetCountries: [],
      minBudget: null,
      idealCustomerSummary: null,
    },
  };
}

function buildReasonJson(
  classifier: LeadHuntingClassifierOutput,
  score: LeadHuntingScoreOutput,
  archive: LeadHuntingArchiveOutput | null,
  calls: { classifier?: AiCallRecord; scorer?: AiCallRecord; archive?: AiCallRecord },
): Json {
  return toJson([
    ...classifier.reasons.map((text: string) => ({ stage: 'classifier', text })),
    ...score.reasons.map((text: string) => ({ stage: 'scorer', text })),
    ...(archive ? [{ stage: 'archive', text: archive.reasonForArchive }] : []),
    {
      stage: 'meta',
      classifierPromptVersionId: calls.classifier?.aiPromptVersionId ?? null,
      scorerPromptVersionId: calls.scorer?.aiPromptVersionId ?? null,
      archivePromptVersionId: calls.archive?.aiPromptVersionId ?? null,
      classifierModel: calls.classifier
        ? { provider: calls.classifier.provider, model: calls.classifier.model }
        : null,
      scorerModel: calls.scorer ? { provider: calls.scorer.provider, model: calls.scorer.model } : null,
      archiveModel: calls.archive ? { provider: calls.archive.provider, model: calls.archive.model } : null,
    },
  ]);
}

@Injectable()
export class LeadHuntingClassificationService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly aiPool: AiProviderPoolService,
  ) {}

  async classifyRawPost(
    organizationId: string,
    rawPost: RawPostRow,
    report: PostResearchReportRow,
    userId: string,
  ): Promise<LeadHuntingClassificationResult> {
    const [profileRow] = await Promise.all([this.loadActiveProfile(organizationId)]);
    const profile = mapCompanyProfile(profileRow);
    const input = {
      ...buildInput(rawPost, report),
      profile,
    };

    let lastCall: AiCallRecord | undefined;
    const ai = await this.aiPool.buildService({
      organizationId,
      hooks: {
        onCall: (record) => {
          if (record.status !== 'error') {
            lastCall = record;
          }
        },
      },
    });

    const classifier = await classifyLeadHuntingPost(ai, {
      taskType: 'post_research_classifier',
      organizationId,
      userId,
    }, input);
    const classifierCall = lastCall;

    const score = await scoreLeadHuntingPost(ai, {
      taskType: 'lead_quality_scorer',
      organizationId,
      userId,
    }, input, classifier);
    const scorerCall = lastCall;

    const decision = determineLeadHuntingDecision({
      classification: classifier.classification,
      leadScore: score.leadScore,
      isActualLead: classifier.isActualLead,
    });

    let archive: LeadHuntingArchiveOutput | null = null;
    let archiveCall: AiCallRecord | undefined;
    if (decision === 'archived') {
      archive = await classifyArchivedLeadHuntingPost(ai, {
        taskType: 'archive_classifier',
        organizationId,
        userId,
      }, input, classifier, score);
      archiveCall = lastCall;
    }

    const payload: Database['public']['Tables']['post_classifications']['Insert'] = {
      organization_id: organizationId,
      raw_post_id: rawPost.id,
      ai_request_id: null,
      ai_prompt_version_id: classifierCall?.aiPromptVersionId ?? scorerCall?.aiPromptVersionId ?? null,
      classification: classifier.classification,
      lead_score: score.leadScore,
      lead_quality: score.leadQuality,
      is_actual_lead: classifier.isActualLead,
      urgency: classifier.urgency,
      service_match: toJson(classifier.serviceMatch),
      reason_json: buildReasonJson(classifier, score, archive, {
        classifier: classifierCall,
        scorer: scorerCall,
        archive: archiveCall,
      }),
      recommended_action: classifier.recommendedAction,
    };

    const { data, error } = await this.supabase
      .from('post_classifications')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to persist post classification for ${rawPost.id}: ${error?.message ?? 'unknown error'}`);
    }

    return {
      row: data as PostClassificationRow,
      classifier,
      score,
      archive,
      decision,
    };
  }

  private async loadActiveProfile(organizationId: string): Promise<CompanyProfileRow | null> {
    const { data, error } = await this.supabase
      .from('company_profiles')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load active company profile for ${organizationId}: ${error.message}`);
    }

    return (data as CompanyProfileRow | null) ?? null;
  }
}
