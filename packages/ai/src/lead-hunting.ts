import type { AIService } from './service';
import type { AiCallContext } from './types';

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

export interface LeadHuntingCompanyProfileContext {
  services: string[];
  priorityServices: string[];
  targetIndustries: string[];
  targetCountries: string[];
  minBudget: number | null;
  idealCustomerSummary?: string | null;
}

export interface LeadHuntingResearchInput {
  postUrl?: string | null;
  postText?: string | null;
  mediaText?: string | null;
  ownerName?: string | null;
  ownerHeadline?: string | null;
  ownerProfileUrl?: string | null;
  visibleCompanyName?: string | null;
  visibleCompanyUrl?: string | null;
  postDate?: string | null;
  personSummary?: string | null;
  companySummary?: string | null;
  websiteSummary?: string | null;
  emailSummary?: string | null;
  managementSummary?: string | null;
  countrySummary?: string | null;
  opportunitySummary?: string | null;
  researchConfidence?: number | null;
  profile: LeadHuntingCompanyProfileContext;
}

export interface LeadHuntingServiceMatch {
  service: string;
  confidence: number;
  isPriority: boolean;
  reason?: string | null;
}

export interface LeadHuntingClassifierOutput {
  classification: LeadHuntingClassification;
  isActualLead: boolean;
  urgency: 'urgent' | 'soon' | 'later' | 'none';
  serviceMatch: LeadHuntingServiceMatch[];
  reasons: string[];
  recommendedAction: string;
  summary: string;
}

export interface LeadHuntingScoreOutput {
  leadScore: number;
  leadQuality: 'very_high' | 'high' | 'medium' | 'low';
  reasons: string[];
}

export interface LeadHuntingArchiveOutput {
  archiveCategory: ArchivedPostCategory;
  topic: string | null;
  summary: string;
  keywords: string[];
  reasonForArchive: string;
  marketSignalScore: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const text = nonEmptyString(entry);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function list(label: string, values: string[]): string {
  return values.length ? `${label}: ${values.join(', ')}` : `${label}: (none specified)`;
}

function researchLines(input: LeadHuntingResearchInput): string[] {
  return [
    input.postUrl ? `Post URL: ${input.postUrl}` : null,
    input.ownerName ? `Author: ${input.ownerName}` : null,
    input.ownerHeadline ? `Author headline: ${input.ownerHeadline}` : null,
    input.ownerProfileUrl ? `Author profile: ${input.ownerProfileUrl}` : null,
    input.visibleCompanyName ? `Visible company: ${input.visibleCompanyName}` : null,
    input.visibleCompanyUrl ? `Visible company URL: ${input.visibleCompanyUrl}` : null,
    input.postDate ? `Post date: ${input.postDate}` : null,
    input.postText ? `Post text: ${input.postText}` : null,
    input.mediaText ? `Media text: ${input.mediaText}` : null,
    input.personSummary ? `Person research: ${input.personSummary}` : null,
    input.companySummary ? `Company research: ${input.companySummary}` : null,
    input.websiteSummary ? `Website research: ${input.websiteSummary}` : null,
    input.emailSummary ? `Email research: ${input.emailSummary}` : null,
    input.managementSummary ? `Management research: ${input.managementSummary}` : null,
    input.countrySummary ? `Country research: ${input.countrySummary}` : null,
    input.opportunitySummary ? `Opportunity summary: ${input.opportunitySummary}` : null,
    input.researchConfidence != null ? `Research confidence: ${input.researchConfidence}` : null,
  ].filter((line): line is string => line !== null);
}

function profileLines(profile: LeadHuntingCompanyProfileContext): string[] {
  return [
    list('Services', profile.services),
    list('Priority services', profile.priorityServices),
    list('Target industries', profile.targetIndustries),
    list('Target countries', profile.targetCountries),
    `Minimum budget: ${profile.minBudget == null ? '(none specified)' : profile.minBudget}`,
    profile.idealCustomerSummary ? `Ideal customer: ${profile.idealCustomerSummary}` : null,
  ].filter((line): line is string => line !== null);
}

export function parseLeadHuntingClassifierOutput(raw: unknown): LeadHuntingClassifierOutput {
  if (!isRecord(raw)) {
    throw new Error('lead-hunting classifier output must be a JSON object');
  }

  const recommendedAction = nonEmptyString(raw.recommendedAction);
  const summary = nonEmptyString(raw.summary);
  if (!recommendedAction || !summary) {
    throw new Error('lead-hunting classifier output requires non-empty recommendedAction and summary');
  }

  const serviceMatch: LeadHuntingServiceMatch[] = Array.isArray(raw.serviceMatch)
    ? raw.serviceMatch.flatMap((entry): LeadHuntingServiceMatch[] => {
        if (!isRecord(entry)) return [];
        const service = nonEmptyString(entry.service);
        if (!service) return [];
        return [
          {
            service,
            confidence: clamp(numberOrNull(entry.confidence) ?? 0, 0, 1),
            isPriority: entry.isPriority === true,
            reason: nonEmptyString(entry.reason),
          },
        ];
      })
    : [];

  return {
    classification: coerceEnum(
      raw.classification,
      LEAD_HUNTING_CLASSIFICATIONS,
      'informational_post',
    ),
    isActualLead: raw.isActualLead === true,
    urgency: coerceEnum(raw.urgency, ['urgent', 'soon', 'later', 'none'] as const, 'none'),
    serviceMatch,
    reasons: stringList(raw.reasons, 8),
    recommendedAction,
    summary,
  };
}

export function parseLeadHuntingScoreOutput(raw: unknown): LeadHuntingScoreOutput {
  if (!isRecord(raw)) {
    throw new Error('lead-hunting score output must be a JSON object');
  }

  const leadScore = clamp(numberOrNull(raw.leadScore) ?? -1, 0, 100);
  if (!Number.isFinite(leadScore)) {
    throw new Error('lead-hunting score output requires a numeric leadScore');
  }

  return {
    leadScore,
    leadQuality: coerceEnum(raw.leadQuality, ['very_high', 'high', 'medium', 'low'] as const, 'low'),
    reasons: stringList(raw.reasons, 8),
  };
}

export function parseLeadHuntingArchiveOutput(raw: unknown): LeadHuntingArchiveOutput {
  if (!isRecord(raw)) {
    throw new Error('lead-hunting archive output must be a JSON object');
  }

  const summary = nonEmptyString(raw.summary);
  const reasonForArchive = nonEmptyString(raw.reasonForArchive);
  if (!summary || !reasonForArchive) {
    throw new Error('lead-hunting archive output requires non-empty summary and reasonForArchive');
  }

  return {
    archiveCategory: coerceEnum(
      raw.archiveCategory,
      ARCHIVED_POST_CATEGORIES,
      'general_update',
    ),
    topic: nonEmptyString(raw.topic),
    summary,
    keywords: stringList(raw.keywords, 10),
    reasonForArchive,
    marketSignalScore: clamp(numberOrNull(raw.marketSignalScore) ?? 0, 0, 100),
  };
}

export function buildLeadHuntingClassifierPrompt(input: LeadHuntingResearchInput): string {
  return [
    'You classify researched LinkedIn posts for an agency lead-hunting pipeline.',
    'Decide whether the post is an actual sales lead, what type of post it is, and which of our services fit.',
    'Use only the provided evidence. Do not invent facts or contact details.',
    '',
    'OUR PROFILE',
    ...profileLines(input.profile),
    '',
    'POST + RESEARCH',
    ...researchLines(input),
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{',
    '  "classification": "actual_requirement|hiring_requirement|service_needed|vendor_needed|partnership_opportunity|funding_signal|expansion_signal|complaint_or_pain_signal|buying_intent_signal|informational_post|personal_branding_post|news_update|promotion_only|job_seeker_post|irrelevant|spam",',
    '  "isActualLead": boolean,',
    '  "urgency": "urgent|soon|later|none",',
    '  "serviceMatch": [{ "service": string, "confidence": number, "isPriority": boolean, "reason": string }],',
    '  "reasons": string[],',
    '  "recommendedAction": string,',
    '  "summary": string',
    '}',
    'Set isActualLead=true only when the post shows a real or highly plausible buying need, hiring need, vendor search, or partnership requirement relevant to an agency.',
    'Keep reasons short and evidence-based.',
  ].join('\n');
}

export function buildLeadHuntingScorePrompt(
  input: LeadHuntingResearchInput,
  classifier: LeadHuntingClassifierOutput,
): string {
  return [
    'You score a researched LinkedIn post for lead quality from 0 to 100 for an agency sales team.',
    'Use the evidence plus the upstream classifier result. Score fit, urgency, specificity of need, and service alignment.',
    '',
    'OUR PROFILE',
    ...profileLines(input.profile),
    '',
    'POST + RESEARCH',
    ...researchLines(input),
    '',
    'CLASSIFIER RESULT',
    `Classification: ${classifier.classification}`,
    `Is actual lead: ${classifier.isActualLead ? 'yes' : 'no'}`,
    `Urgency: ${classifier.urgency}`,
    `Service matches: ${
      classifier.serviceMatch.length
        ? classifier.serviceMatch
            .map((match) => `${match.service} (${Math.round(match.confidence * 100)}%)`)
            .join(', ')
        : '(none)'
    }`,
    `Classifier summary: ${classifier.summary}`,
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{',
    '  "leadScore": number,',
    '  "leadQuality": "very_high|high|medium|low",',
    '  "reasons": string[]',
    '}',
    'A score of 75+ means clearly worth moving into the CRM pipeline. 45-74 means human review. Keep reasons concise.',
  ].join('\n');
}

export function buildLeadHuntingArchivePrompt(
  input: LeadHuntingResearchInput,
  classifier: LeadHuntingClassifierOutput,
  score: LeadHuntingScoreOutput,
): string {
  return [
    'You categorize a non-qualified LinkedIn post for an archive/intelligence bucket.',
    'Use the evidence, the classifier result, and the score. Do not re-score the post.',
    '',
    'POST + RESEARCH',
    ...researchLines(input),
    '',
    'CLASSIFIER RESULT',
    `Classification: ${classifier.classification}`,
    `Is actual lead: ${classifier.isActualLead ? 'yes' : 'no'}`,
    `Urgency: ${classifier.urgency}`,
    `Summary: ${classifier.summary}`,
    `Score: ${score.leadScore}`,
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{',
    '  "archiveCategory": "market_insight|competitor_activity|industry_news|educational_content|personal_branding|general_update|irrelevant|spam",',
    '  "topic": string | null,',
    '  "summary": string,',
    '  "keywords": string[],',
    '  "reasonForArchive": string,',
    '  "marketSignalScore": number',
    '}',
    'Use marketSignalScore to capture how useful this post is as non-lead intelligence.',
  ].join('\n');
}

export async function classifyLeadHuntingPost(
  ai: AIService,
  ctx: AiCallContext,
  input: LeadHuntingResearchInput,
): Promise<LeadHuntingClassifierOutput> {
  return ai.generateStructured(ctx, {
    prompt: buildLeadHuntingClassifierPrompt(input),
    parse: parseLeadHuntingClassifierOutput,
    schemaName: 'lead_hunting_classifier',
  });
}

export async function scoreLeadHuntingPost(
  ai: AIService,
  ctx: AiCallContext,
  input: LeadHuntingResearchInput,
  classifier: LeadHuntingClassifierOutput,
): Promise<LeadHuntingScoreOutput> {
  return ai.generateStructured(ctx, {
    prompt: buildLeadHuntingScorePrompt(input, classifier),
    parse: parseLeadHuntingScoreOutput,
    schemaName: 'lead_hunting_score',
  });
}

export async function classifyArchivedLeadHuntingPost(
  ai: AIService,
  ctx: AiCallContext,
  input: LeadHuntingResearchInput,
  classifier: LeadHuntingClassifierOutput,
  score: LeadHuntingScoreOutput,
): Promise<LeadHuntingArchiveOutput> {
  return ai.generateStructured(ctx, {
    prompt: buildLeadHuntingArchivePrompt(input, classifier, score),
    parse: parseLeadHuntingArchiveOutput,
    schemaName: 'lead_hunting_archive',
  });
}
