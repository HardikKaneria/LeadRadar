import { Inject, Injectable } from '@nestjs/common';
import {
  buildHeuristicScoringStrategy,
  DEFAULT_HEURISTIC_SCORING_WEIGHTS,
  normalizeHeuristicScoringWeights,
  type HeuristicScoringWeights,
  type ScoreResult,
  type ScoringFeatures,
  type ScoringStrategyKind,
} from '@radar/ai';
import type { Database, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

type ScoringStrategyRow = Database['public']['Tables']['scoring_strategies']['Row'];

export interface ActiveScoringStrategy {
  id: string;
  organizationId: string;
  version: number;
  kind: ScoringStrategyKind;
  weights: HeuristicScoringWeights;
  metrics: ScoringStrategyRow['metrics'];
  createdAt: string;
}

export interface StrategyScoreResult extends ScoreResult {
  strategyId: string;
  strategyVersion: number;
  strategyKind: ScoringStrategyKind;
}

export function mapScoringStrategyRow(row: ScoringStrategyRow): ActiveScoringStrategy {
  if (row.kind !== 'heuristic') {
    throw new Error(`Unsupported scoring strategy kind: ${row.kind}`);
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    version: row.version,
    kind: row.kind,
    weights: normalizeHeuristicScoringWeights(row.weights),
    metrics: row.metrics,
    createdAt: row.created_at,
  };
}

@Injectable()
export class ScoringStrategyService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async loadActiveStrategy(organizationId: string): Promise<ActiveScoringStrategy> {
    const existing = await this.fetchActiveRow(organizationId);
    if (existing) return mapScoringStrategyRow(existing);

    const created = await this.createDefaultStrategy(organizationId);
    return mapScoringStrategyRow(created);
  }

  async score(organizationId: string, features: ScoringFeatures): Promise<StrategyScoreResult> {
    const strategy = await this.loadActiveStrategy(organizationId);
    const result = buildHeuristicScoringStrategy(strategy.weights).score(features);

    return {
      ...result,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      strategyKind: strategy.kind,
    };
  }

  private async fetchActiveRow(organizationId: string): Promise<ScoringStrategyRow | null> {
    const { data, error } = await this.supabase
      .from('scoring_strategies')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load active scoring strategy for ${organizationId}: ${error.message}`);
    }

    return (data as ScoringStrategyRow | null) ?? null;
  }

  private async createDefaultStrategy(organizationId: string): Promise<ScoringStrategyRow> {
    const version = await this.nextVersion(organizationId);
    const { data, error } = await this.supabase
      .from('scoring_strategies')
      .insert({
        organization_id: organizationId,
        version,
        kind: 'heuristic',
        weights: DEFAULT_HEURISTIC_SCORING_WEIGHTS,
        metrics: {},
        is_active: true,
      })
      .select('*')
      .single();

    if (error) {
      const retry = await this.fetchActiveRow(organizationId);
      if (retry) return retry;
      throw new Error(`Failed to create default scoring strategy for ${organizationId}: ${error.message}`);
    }

    return data as ScoringStrategyRow;
  }

  private async nextVersion(organizationId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('scoring_strategies')
      .select('version')
      .eq('organization_id', organizationId)
      .order('version', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to load scoring strategy versions for ${organizationId}: ${error.message}`);
    }

    return ((data?.[0] as Pick<ScoringStrategyRow, 'version'> | undefined)?.version ?? 0) + 1;
  }
}
