/**
 * Opportunity Analyzer (P3-06). Pure + offline-testable: the AI extracts the *semantic* signals
 * (intent, urgency, service matches, budget read, recommended action, reason) and the deterministic
 * scoring strategy (P3-05) turns the resolved features into the explainable numeric score. Bad-lead
 * rules from the Company Brain short-circuit before any model call. Storage + strategy resolution +
 * prompt/model metadata live in the API writer (cf. [[D-022]], [[D-023]]).
 */

import type { AIService } from './service';
import {
  SCORING_BUDGET_FITS,
  SCORING_INTENTS,
  SCORING_URGENCY_LEVELS,
  type ScoreResult,
  type ScoringBudgetFit,
  type ScoringFeatures,
  type ScoringIntent,
  type ScoringStrategy,
  type ScoringUrgency,
  type ServiceMatchSignal,
} from './scoring';
import type { AiCallContext } from './types';

export interface AnalyzerDiscovery {
  title?: string | null;
  description?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  country?: string | null;
  website?: string | null;
  email?: string | null;
  source?: string | null;
  budgetHint?: number | null;
}

export type BadLeadRuleField = 'industry' | 'country' | 'keyword' | 'company_name' | 'budget' | 'website';
export type BadLeadRuleOperator = 'equals' | 'contains' | 'in' | 'lt' | 'gt' | 'exists' | 'not_exists';

export interface BadLeadRule {
  field: BadLeadRuleField;
  operator: BadLeadRuleOperator;
  value?: string | number | string[];
}

export interface BadLeadRules {
  logic: 'any' | 'all';
  rules: BadLeadRule[];
}

export interface AnalyzerCompanyProfile {
  services: string[];
  priorityServices: string[];
  targetIndustries: string[];
  targetCountries: string[];
  minBudget: number | null;
  idealCustomerSummary?: string | null;
  badLeadRules: BadLeadRules;
}

/** Validated semantic output the model must return. */
export interface AnalyzerAiOutput {
  intent: ScoringIntent;
  urgency: ScoringUrgency;
  budgetFit: ScoringBudgetFit;
  budgetEstimate: number | null;
  serviceMatches: ServiceMatchSignal[];
  confidence: number;
  recommendedAction: string;
  reason: string;
}

export interface AnalyzerResult {
  score: number;
  intent: ScoringIntent;
  urgency: ScoringUrgency;
  budgetFit: ScoringBudgetFit;
  budgetEstimate: number | null;
  serviceMatches: ServiceMatchSignal[];
  countryMatch: boolean | null;
  confidence: number;
  recommendedAction: string;
  reason: string;
  isBadLead: boolean;
  features: ScoringFeatures;
  scoreResult: ScoreResult;
}

export interface AnalyzeOpportunityInput {
  discovery: AnalyzerDiscovery;
  profile: AnalyzerCompanyProfile;
  strategy: ScoringStrategy;
  similarityToWon?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function searchableText(discovery: AnalyzerDiscovery): string {
  return [discovery.title, discovery.description, discovery.companyName, discovery.source]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' \n ')
    .toLowerCase();
}

/** Resolve the discovery value a bad-lead rule reads. Text fields collapse to a lowercased string. */
function ruleFieldValue(discovery: AnalyzerDiscovery, field: BadLeadRuleField): string | number | null {
  switch (field) {
    case 'country':
      return discovery.country ? discovery.country.toLowerCase() : null;
    case 'company_name':
      return discovery.companyName ? discovery.companyName.toLowerCase() : null;
    case 'website':
      return discovery.website ?? null;
    case 'budget':
      return numberOrNull(discovery.budgetHint);
    case 'keyword':
    case 'industry':
      return searchableText(discovery) || null;
  }
}

function ruleMatches(discovery: AnalyzerDiscovery, rule: BadLeadRule): boolean {
  const fieldValue = ruleFieldValue(discovery, rule.field);

  switch (rule.operator) {
    case 'exists':
      return fieldValue !== null && fieldValue !== '';
    case 'not_exists':
      return fieldValue === null || fieldValue === '';
    case 'equals':
      if (typeof fieldValue === 'number') return fieldValue === Number(rule.value);
      return typeof fieldValue === 'string' && fieldValue === String(rule.value).toLowerCase();
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(String(rule.value).toLowerCase());
    case 'in':
      return (
        typeof fieldValue === 'string' &&
        Array.isArray(rule.value) &&
        rule.value.some((entry) => String(entry).toLowerCase() === fieldValue)
      );
    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < Number(rule.value);
    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > Number(rule.value);
    default:
      return false;
  }
}

export interface BadLeadEvaluation {
  matched: boolean;
  reason?: string;
}

export function evaluateBadLeadRules(
  discovery: AnalyzerDiscovery,
  rules: BadLeadRules,
): BadLeadEvaluation {
  if (!rules.rules.length) return { matched: false };

  const results = rules.rules.map((rule) => ({ rule, hit: ruleMatches(discovery, rule) }));
  const matched = rules.logic === 'all' ? results.every((r) => r.hit) : results.some((r) => r.hit);
  if (!matched) return { matched: false };

  const trigger = rules.logic === 'all' ? results[0] : results.find((r) => r.hit);
  const rule = trigger?.rule;
  const reason = rule
    ? `Matched bad-lead rule: ${rule.field} ${rule.operator}${rule.value === undefined ? '' : ` ${JSON.stringify(rule.value)}`}`
    : 'Matched a bad-lead rule';
  return { matched: true, reason };
}

/** Validate/coerce the model's JSON. Throws (→ one repair pass) only when it is fundamentally unusable. */
export function parseAnalyzerOutput(raw: unknown): AnalyzerAiOutput {
  if (!isRecord(raw)) {
    throw new Error('analyzer output must be a JSON object');
  }

  const recommendedAction = nonEmptyString(raw.recommendedAction);
  const reason = nonEmptyString(raw.reason);
  if (!recommendedAction || !reason) {
    throw new Error('analyzer output requires non-empty recommendedAction and reason');
  }

  const serviceMatches: ServiceMatchSignal[] = Array.isArray(raw.serviceMatches)
    ? raw.serviceMatches.flatMap((entry): ServiceMatchSignal[] => {
        if (!isRecord(entry)) return [];
        const service = nonEmptyString(entry.service);
        if (!service) return [];
        return [
          {
            service,
            confidence: clamp(numberOrNull(entry.confidence) ?? 0, 0, 1),
            isPriority: entry.isPriority === true,
          },
        ];
      })
    : [];

  return {
    intent: coerceEnum(raw.intent, SCORING_INTENTS, 'unclear'),
    urgency: coerceEnum(raw.urgency, SCORING_URGENCY_LEVELS, 'none'),
    budgetFit: coerceEnum(raw.budgetFit, SCORING_BUDGET_FITS, 'unknown'),
    budgetEstimate: numberOrNull(raw.budgetEstimate),
    serviceMatches,
    confidence: clamp(numberOrNull(raw.confidence) ?? 0, 0, 1),
    recommendedAction,
    reason,
  };
}

function list(label: string, values: string[]): string {
  return values.length ? `${label}: ${values.join(', ')}` : `${label}: (none specified)`;
}

export function buildAnalyzerPrompt(
  discovery: AnalyzerDiscovery,
  profile: AnalyzerCompanyProfile,
): string {
  const profileLines = [
    list('Our services', profile.services),
    list('Priority services', profile.priorityServices),
    list('Target industries', profile.targetIndustries),
    list('Target countries', profile.targetCountries),
    `Minimum budget: ${profile.minBudget == null ? '(none specified)' : profile.minBudget}`,
    profile.idealCustomerSummary ? `Ideal customer: ${profile.idealCustomerSummary}` : null,
  ].filter((line): line is string => line !== null);

  const discoveryLines = [
    discovery.title ? `Title: ${discovery.title}` : null,
    discovery.companyName ? `Company: ${discovery.companyName}` : null,
    discovery.contactName ? `Contact: ${discovery.contactName}` : null,
    discovery.country ? `Country: ${discovery.country}` : null,
    discovery.website ? `Website: ${discovery.website}` : null,
    discovery.source ? `Source: ${discovery.source}` : null,
    discovery.budgetHint != null ? `Budget hint: ${discovery.budgetHint}` : null,
    discovery.description ? `Description: ${discovery.description}` : null,
  ].filter((line): line is string => line !== null);

  return [
    'You are analysing a discovered sales opportunity against our agency profile.',
    '',
    'OUR PROFILE',
    ...profileLines,
    '',
    'OPPORTUNITY',
    ...(discoveryLines.length ? discoveryLines : ['(no structured fields provided)']),
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{',
    '  "intent": "high|medium|low|unclear",',
    '  "urgency": "urgent|soon|later|none",',
    '  "budgetFit": "above_min|below_min|unknown",',
    '  "budgetEstimate": number | null,',
    '  "serviceMatches": [{ "service": string, "confidence": 0..1, "isPriority": boolean }],',
    '  "confidence": 0..1,',
    '  "recommendedAction": string,',
    '  "reason": string',
    '}',
    'Match services only against the services we listed. Base every judgement on the provided context; never invent facts.',
  ].join('\n');
}

function resolveCountryMatch(discovery: AnalyzerDiscovery, profile: AnalyzerCompanyProfile): boolean | null {
  if (!profile.targetCountries.length || !discovery.country) return profile.targetCountries.length ? false : null;
  const country = discovery.country.toLowerCase();
  return profile.targetCountries.some((target) => target.toLowerCase() === country);
}

/** Deterministic budget fit wins when both the minimum and a budget figure are known. */
function resolveBudgetFit(
  discovery: AnalyzerDiscovery,
  profile: AnalyzerCompanyProfile,
  aiOutput: AnalyzerAiOutput,
): ScoringBudgetFit {
  const budget = numberOrNull(discovery.budgetHint) ?? aiOutput.budgetEstimate;
  if (profile.minBudget != null && budget != null) {
    return budget >= profile.minBudget ? 'above_min' : 'below_min';
  }
  return aiOutput.budgetFit;
}

function badLeadResult(reason: string): AnalyzerResult {
  const features: ScoringFeatures = {
    serviceMatches: [],
    countryMatch: null,
    budgetFit: 'unknown',
    intent: 'unclear',
    urgency: 'none',
    similarityToWon: 0,
  };
  return {
    score: 0,
    intent: 'unclear',
    urgency: 'none',
    budgetFit: 'unknown',
    budgetEstimate: null,
    serviceMatches: [],
    countryMatch: null,
    confidence: 1,
    recommendedAction: 'Reject — matches a bad-lead rule',
    reason,
    isBadLead: true,
    features,
    scoreResult: { score: 0, reason, factors: [] },
  };
}

export async function analyzeOpportunity(
  ai: AIService,
  ctx: AiCallContext,
  input: AnalyzeOpportunityInput,
): Promise<AnalyzerResult> {
  const { discovery, profile, strategy, similarityToWon } = input;

  const badLead = evaluateBadLeadRules(discovery, profile.badLeadRules);
  if (badLead.matched) {
    return badLeadResult(badLead.reason ?? 'Matched a bad-lead rule');
  }

  const aiOutput = await ai.generateStructured(ctx, {
    prompt: buildAnalyzerPrompt(discovery, profile),
    parse: parseAnalyzerOutput,
    schemaName: 'opportunity_analysis',
  });

  const features: ScoringFeatures = {
    serviceMatches: aiOutput.serviceMatches,
    countryMatch: resolveCountryMatch(discovery, profile),
    budgetFit: resolveBudgetFit(discovery, profile, aiOutput),
    intent: aiOutput.intent,
    urgency: aiOutput.urgency,
    similarityToWon,
  };

  const scoreResult = strategy.score(features);

  return {
    score: scoreResult.score,
    intent: features.intent,
    urgency: features.urgency,
    budgetFit: features.budgetFit,
    budgetEstimate: aiOutput.budgetEstimate,
    serviceMatches: features.serviceMatches,
    countryMatch: features.countryMatch,
    confidence: aiOutput.confidence,
    recommendedAction: aiOutput.recommendedAction,
    reason: aiOutput.reason,
    isBadLead: false,
    features,
    scoreResult,
  };
}
