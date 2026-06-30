export const SCORING_STRATEGY_KINDS = ['heuristic', 'statistical', 'ml'] as const;
export type ScoringStrategyKind = (typeof SCORING_STRATEGY_KINDS)[number];

export const SCORING_INTENTS = ['high', 'medium', 'low', 'unclear'] as const;
export type ScoringIntent = (typeof SCORING_INTENTS)[number];

export const SCORING_URGENCY_LEVELS = ['urgent', 'soon', 'later', 'none'] as const;
export type ScoringUrgency = (typeof SCORING_URGENCY_LEVELS)[number];

export const SCORING_BUDGET_FITS = ['above_min', 'below_min', 'unknown'] as const;
export type ScoringBudgetFit = (typeof SCORING_BUDGET_FITS)[number];

export interface ServiceMatchSignal {
  service: string;
  confidence: number;
  isPriority?: boolean;
}

export interface ScoringFeatures {
  serviceMatches: ServiceMatchSignal[];
  countryMatch: boolean | null;
  budgetFit: ScoringBudgetFit;
  intent: ScoringIntent;
  urgency: ScoringUrgency;
  similarityToWon?: number; // 0.0 to 1.0 similarity score to past closed-won opportunities
}

export interface HeuristicScoringWeights {
  serviceMatch: number;
  priorityServiceMatch: number;
  countryMatch: number;
  budgetFit: Record<ScoringBudgetFit, number>;
  intent: Record<ScoringIntent, number>;
  urgency: Record<ScoringUrgency, number>;
  similarityToWon: number;
}

export interface PartialHeuristicScoringWeights {
  serviceMatch?: number;
  priorityServiceMatch?: number;
  countryMatch?: number;
  budgetFit?: Partial<Record<ScoringBudgetFit, number>>;
  intent?: Partial<Record<ScoringIntent, number>>;
  urgency?: Partial<Record<ScoringUrgency, number>>;
  similarityToWon?: number;
}

export interface ScoreFactor {
  key:
    | 'service_match'
    | 'priority_service_match'
    | 'country_match'
    | 'budget_fit'
    | 'intent'
    | 'urgency'
    | 'similarity_to_won';
  label: string;
  contribution: number;
  detail: string;
}

export interface ScoreResult {
  score: number;
  reason: string;
  factors: ScoreFactor[];
}

export interface ScoringStrategy {
  score(features: ScoringFeatures): ScoreResult;
}

export const DEFAULT_HEURISTIC_SCORING_WEIGHTS: HeuristicScoringWeights = {
  serviceMatch: 20, // Reduced from 25
  priorityServiceMatch: 15, // Reduced from 20
  countryMatch: 10,
  budgetFit: {
    above_min: 10,
    below_min: -15,
    unknown: 0,
  },
  intent: {
    high: 20,
    medium: 10,
    low: -10,
    unclear: 0,
  },
  urgency: {
    urgent: 15,
    soon: 8,
    later: 3,
    none: 0,
  },
  similarityToWon: 10,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function confidenceScore(signal: ServiceMatchSignal | undefined): number {
  if (!signal) return 0;
  return clamp(signal.confidence, 0, 1);
}

function bestServiceMatch(serviceMatches: ServiceMatchSignal[]): ServiceMatchSignal | undefined {
  return [...serviceMatches].sort((a, b) => confidenceScore(b) - confidenceScore(a))[0];
}

function bestPriorityServiceMatch(serviceMatches: ServiceMatchSignal[]): ServiceMatchSignal | undefined {
  return bestServiceMatch(serviceMatches.filter((signal) => signal.isPriority));
}

function buildReason(factors: ScoreFactor[]): string {
  const positives = [...factors]
    .filter((factor) => factor.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((factor) => factor.detail);

  if (positives.length > 0) {
    return positives.join('; ');
  }

  const negatives = [...factors]
    .filter((factor) => factor.contribution < 0)
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 2)
    .map((factor) => factor.detail);

  return negatives.join('; ') || 'Insufficient qualifying signals';
}

export function normalizeHeuristicScoringWeights(input?: unknown): HeuristicScoringWeights {
  const record = isRecord(input) ? input : {};
  const budgetFit = isRecord(record.budgetFit) ? record.budgetFit : {};
  const intent = isRecord(record.intent) ? record.intent : {};
  const urgency = isRecord(record.urgency) ? record.urgency : {};

  return {
    serviceMatch: readNumber(record.serviceMatch, DEFAULT_HEURISTIC_SCORING_WEIGHTS.serviceMatch),
    priorityServiceMatch: readNumber(
      record.priorityServiceMatch,
      DEFAULT_HEURISTIC_SCORING_WEIGHTS.priorityServiceMatch,
    ),
    countryMatch: readNumber(record.countryMatch, DEFAULT_HEURISTIC_SCORING_WEIGHTS.countryMatch),
    budgetFit: {
      above_min: readNumber(budgetFit.above_min, DEFAULT_HEURISTIC_SCORING_WEIGHTS.budgetFit.above_min),
      below_min: readNumber(budgetFit.below_min, DEFAULT_HEURISTIC_SCORING_WEIGHTS.budgetFit.below_min),
      unknown: readNumber(budgetFit.unknown, DEFAULT_HEURISTIC_SCORING_WEIGHTS.budgetFit.unknown),
    },
    intent: {
      high: readNumber(intent.high, DEFAULT_HEURISTIC_SCORING_WEIGHTS.intent.high),
      medium: readNumber(intent.medium, DEFAULT_HEURISTIC_SCORING_WEIGHTS.intent.medium),
      low: readNumber(intent.low, DEFAULT_HEURISTIC_SCORING_WEIGHTS.intent.low),
      unclear: readNumber(intent.unclear, DEFAULT_HEURISTIC_SCORING_WEIGHTS.intent.unclear),
    },
    urgency: {
      urgent: readNumber(urgency.urgent, DEFAULT_HEURISTIC_SCORING_WEIGHTS.urgency.urgent),
      soon: readNumber(urgency.soon, DEFAULT_HEURISTIC_SCORING_WEIGHTS.urgency.soon),
      later: readNumber(urgency.later, DEFAULT_HEURISTIC_SCORING_WEIGHTS.urgency.later),
      none: readNumber(urgency.none, DEFAULT_HEURISTIC_SCORING_WEIGHTS.urgency.none),
    },
    similarityToWon: readNumber(record.similarityToWon, DEFAULT_HEURISTIC_SCORING_WEIGHTS.similarityToWon),
  };
}

export function buildHeuristicScoringStrategy(
  input?: PartialHeuristicScoringWeights | Record<string, unknown> | null,
): ScoringStrategy {
  const weights = normalizeHeuristicScoringWeights(input);

  return {
    score(features: ScoringFeatures): ScoreResult {
      const strongestService = bestServiceMatch(features.serviceMatches);
      const strongestPriorityService = bestPriorityServiceMatch(features.serviceMatches);

      const factors: ScoreFactor[] = [
        {
          key: 'service_match',
          label: 'Service match',
          contribution: confidenceScore(strongestService) * weights.serviceMatch,
          detail: strongestService
            ? `Service fit for ${strongestService.service}`
            : 'No matching service signal',
        },
        {
          key: 'priority_service_match',
          label: 'Priority service match',
          contribution: confidenceScore(strongestPriorityService) * weights.priorityServiceMatch,
          detail: strongestPriorityService
            ? `Priority service fit for ${strongestPriorityService.service}`
            : 'No priority-service match',
        },
        {
          key: 'country_match',
          label: 'Country match',
          contribution: features.countryMatch ? weights.countryMatch : 0,
          detail: features.countryMatch ? 'Target-country match' : 'No target-country match',
        },
        {
          key: 'budget_fit',
          label: 'Budget fit',
          contribution: weights.budgetFit[features.budgetFit],
          detail:
            features.budgetFit === 'above_min'
              ? 'Budget meets the company minimum'
              : features.budgetFit === 'below_min'
                ? 'Budget appears below the company minimum'
                : 'Budget signal is unknown',
        },
        {
          key: 'intent',
          label: 'Intent',
          contribution: weights.intent[features.intent],
          detail:
            features.intent === 'high'
              ? 'High-intent buying signal'
              : features.intent === 'medium'
                ? 'Moderate buying intent'
                : features.intent === 'low'
                  ? 'Low buying intent'
                  : 'Intent is unclear',
        },
        {
          key: 'urgency',
          label: 'Urgency',
          contribution: weights.urgency[features.urgency],
          detail:
            features.urgency === 'urgent'
              ? 'Urgent timeline'
              : features.urgency === 'soon'
                ? 'Near-term timeline'
                : features.urgency === 'later'
                  ? 'Longer-term timeline'
                  : 'No urgency signal',
        },
      ];

      if (features.similarityToWon != null && features.similarityToWon > 0) {
        // Similarity score is 0.0 to 1.0, scale weight proportionally
        const similarityScore = features.similarityToWon;
        const similarityContribution = round(weights.similarityToWon * similarityScore);
        
        factors.push({
          key: 'similarity_to_won',
          label: 'Similarity to Won',
          contribution: similarityContribution,
          detail: `Looks ${(similarityScore * 100).toFixed(0)}% similar to past closed-won opportunities`,
        });
      }

      const rawScore = factors.reduce((sum, factor) => sum + factor.contribution, 0);

      return {
        score: round(clamp(rawScore, 0, 100)),
        reason: buildReason(factors),
        factors: factors.map((factor) => ({
          ...factor,
          contribution: Math.round(factor.contribution * 100) / 100,
        })),
      };
    },
  };
}
