import { z } from 'zod';

export const knowledgeInsightsQuerySchema = z.object({
  timeframeDays: z.coerce.number().min(1).max(365).default(30),
  groupBy: z.enum(['source', 'score', 'service_match']).default('source'),
});

export type KnowledgeInsightsQuery = z.infer<typeof knowledgeInsightsQuerySchema>;

export interface ConversionInsight {
  group: string;
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  winRate: number;
  avgScore: number | null;
  avgValue: number | null;
}

export interface ConversionInsightsResult {
  data: ConversionInsight[];
  timeframeDays: number;
  groupBy: string;
}

export interface ReasonInsight {
  reason: string;
  count: number;
}

export interface ReasonInsightsResult {
  lost: ReasonInsight[];
  onHold: ReasonInsight[];
}

export interface ScoringStrategyDto {
  id: string;
  version: number;
  kind: 'heuristic' | 'statistical' | 'ml';
  weights: Record<string, number>;
  metrics: Record<string, any>;
  isActive: boolean;
  createdAt: string;
}
