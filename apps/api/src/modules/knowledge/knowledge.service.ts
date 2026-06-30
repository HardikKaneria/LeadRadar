import { Inject, Injectable, Logger } from '@nestjs/common';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type { ServiceClient } from '@radar/supabase';
import type {
  KnowledgeInsightsQuery,
  ConversionInsightsResult,
  ReasonInsightsResult,
  ConversionInsight,
  ScoringStrategyDto,
  RevenueForecastResult,
  StageForecastRow,
} from '@radar/contracts';
import { SupabaseQueueService } from '../../queue/supabase-queue.service';
import { QUEUES } from '@radar/contracts';
import dayjs from 'dayjs';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly queueService: SupabaseQueueService,
  ) {}

  async triggerRecomputeScoring(organizationId: string) {
    await this.queueService.enqueue(
      organizationId,
      QUEUES.recomputeScoring,
      'Recompute Scoring Strategies',
      { organizationId },
    );
    return { queued: true };
  }

  async triggerRecomputeHeat(organizationId: string) {
    await this.queueService.enqueue(
      organizationId,
      QUEUES.recomputeHeat,
      'Recompute Heat Scores',
      { organizationId },
    );
    return { queued: true };
  }

  async listEvents(organizationId: string, limit: number, offset: number) {
    const { data, error, count } = await this.supabase
      .from('knowledge_events')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    
    return {
      items: data,
      total: count ?? 0,
      limit,
      offset,
    };
  }

  async getConversionInsights(
    organizationId: string,
    query: KnowledgeInsightsQuery
  ): Promise<ConversionInsightsResult> {
    const cutoff = dayjs().subtract(query.timeframeDays, 'day').toISOString();
    
    const { data, error } = await this.supabase
      .from('knowledge_events')
      .select('event_type, source, service_match, score, value')
      .eq('organization_id', organizationId)
      .in('event_type', ['won', 'lost'])
      .gte('created_at', cutoff);

    if (error) throw error;

    const grouped = new Map<string, ConversionInsight>();

    const getGroupKey = (event: any) => {
      if (query.groupBy === 'source') return event.source || 'Unknown';
      if (query.groupBy === 'service_match') return event.service_match || 'None';
      if (query.groupBy === 'score') {
        const score = event.score;
        if (score == null) return 'Unscored';
        if (score >= 80) return 'High (80-100)';
        if (score >= 50) return 'Medium (50-79)';
        return 'Low (0-49)';
      }
      return 'Unknown';
    };

    for (const event of data) {
      const key = getGroupKey(event);
      if (!grouped.has(key)) {
        grouped.set(key, {
          group: key,
          totalLeads: 0,
          wonLeads: 0,
          lostLeads: 0,
          winRate: 0,
          avgScore: null,
          avgValue: null,
        });
      }
      
      const g = grouped.get(key)!;
      g.totalLeads++;
      
      if (event.event_type === 'won') g.wonLeads++;
      if (event.event_type === 'lost') g.lostLeads++;
      
      if (event.score != null) {
        g.avgScore = g.avgScore === null ? event.score : (g.avgScore * (g.totalLeads - 1) + event.score) / g.totalLeads;
      }
      
      if (event.value != null) {
        g.avgValue = g.avgValue === null ? event.value : (g.avgValue * (g.totalLeads - 1) + event.value) / g.totalLeads;
      }
    }

    const resultData = Array.from(grouped.values()).map(g => ({
      ...g,
      winRate: g.totalLeads > 0 ? (g.wonLeads / g.totalLeads) * 100 : 0,
    }));

    resultData.sort((a, b) => b.totalLeads - a.totalLeads);

    return {
      data: resultData,
      timeframeDays: query.timeframeDays,
      groupBy: query.groupBy,
    };
  }

  async getReasonInsights(
    organizationId: string,
    query: KnowledgeInsightsQuery
  ): Promise<ReasonInsightsResult> {
    const cutoff = dayjs().subtract(query.timeframeDays, 'day').toISOString();
    
    const { data, error } = await this.supabase
      .from('knowledge_events')
      .select('event_type, reason')
      .eq('organization_id', organizationId)
      .in('event_type', ['lost', 'on_hold'])
      .gte('created_at', cutoff);

    if (error) throw error;

    const lostReasons = new Map<string, number>();
    const onHoldReasons = new Map<string, number>();

    for (const event of data) {
      const r = event.reason || 'Unspecified';
      if (event.event_type === 'lost') {
        lostReasons.set(r, (lostReasons.get(r) || 0) + 1);
      } else if (event.event_type === 'on_hold') {
        onHoldReasons.set(r, (onHoldReasons.get(r) || 0) + 1);
      }
    }

    const format = (map: Map<string, number>) => {
      return Array.from(map.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);
    };

    return {
      lost: format(lostReasons),
      onHold: format(onHoldReasons),
    };
  }

  async listScoringStrategies(organizationId: string): Promise<ScoringStrategyDto[]> {
    const { data, error } = await this.supabase
      .from('scoring_strategies')
      .select('*')
      .eq('organization_id', organizationId)
      .order('version', { ascending: false });

    if (error) throw error;

    return data.map((d: any) => ({
      id: d.id,
      version: d.version,
      kind: d.kind,
      weights: d.weights,
      metrics: d.metrics,
      isActive: d.is_active,
      createdAt: d.created_at,
    }));
  }

  async activateScoringStrategy(organizationId: string, id: string): Promise<void> {
    const { error: deactivateErr } = await this.supabase
      .from('scoring_strategies')
      .update({ is_active: false })
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (deactivateErr) throw deactivateErr;

    const { error: activateErr } = await this.supabase
      .from('scoring_strategies')
      .update({ is_active: true })
      .eq('organization_id', organizationId)
      .eq('id', id);

    if (activateErr) throw activateErr;
  }

  /**
   * Revenue forecast — Σ(conversion_probability(stage, score) × deal_value) across active leads.
   *
   * Stage base rates (prior) are standard SaaS benchmarks. When the org has at least 10 closed
   * deals in the last 90 days the base rates are scaled by `actual_win_rate / benchmark_win_rate`
   * so the model self-calibrates from real history.
   */
  async getRevenueForecast(organizationId: string): Promise<RevenueForecastResult> {
    // Benchmark stage-level close probabilities (new → won path).
    const BASE_PROB: Record<string, number> = {
      new:               0.05,
      contacted:         0.10,
      reply_received:    0.20,
      meeting_scheduled: 0.35,
      proposal_sent:     0.50,
      negotiation:       0.70,
    };

    // Fetch active leads.
    const ACTIVE_STAGES = ['new', 'contacted', 'reply_received', 'meeting_scheduled', 'proposal_sent', 'negotiation'];
    const { data: leads, error: leadsErr } = await this.supabase
      .from('leads')
      .select('id, stage, score, value, currency')
      .eq('organization_id', organizationId)
      .in('stage', ACTIVE_STAGES)
      .is('deleted_at', null);
    if (leadsErr) throw leadsErr;

    // Fetch last-90-day win/loss counts to calibrate base rates.
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = await this.supabase
      .from('knowledge_events')
      .select('event_type')
      .eq('organization_id', organizationId)
      .in('event_type', ['won', 'lost'])
      .gte('created_at', cutoff);

    let calibrationFactor = 1;
    if (events && events.length >= 10) {
      const won = events.filter((e) => e.event_type === 'won').length;
      const actualRate = won / events.length;
      // Benchmark final close rate from 'new' stage ≈ 5 %. Scale all stages proportionally.
      calibrationFactor = actualRate / (BASE_PROB['new'] ?? 0.05);
    }

    // Build per-stage buckets.
    const buckets = new Map<string, { leads: Array<{ score: number; value: number | null; currency: string | null }> }>();
    for (const stage of ACTIVE_STAGES) buckets.set(stage, { leads: [] });

    for (const lead of leads ?? []) {
      buckets.get(lead.stage)?.leads.push({
        score: lead.score ?? 0,
        value: lead.value != null ? Number(lead.value) : null,
        currency: lead.currency ?? null,
      });
    }

    const byStage: StageForecastRow[] = [];
    let totalWeightedValue = 0;
    let totalActiveLeads = 0;
    let totalUnestimated = 0;

    // Currency tallying for dominant currency.
    const currencyCount = new Map<string, number>();

    for (const stage of ACTIVE_STAGES) {
      const { leads: stageLeads } = buckets.get(stage)!;
      const baseProb = Math.min(1, (BASE_PROB[stage] ?? 0.05) * calibrationFactor);

      let weightedValue = 0;
      let totalValue = 0;
      let hasValue = false;
      let unestimated = 0;

      for (const l of stageLeads) {
        // Score modifier: 0.5× at score=0, 1.5× at score=100.
        const scoreMod = 0.5 + (l.score / 100);
        const prob = Math.min(1, baseProb * scoreMod);

        if (l.value != null && l.value > 0) {
          weightedValue += prob * l.value;
          totalValue += l.value;
          hasValue = true;
        } else {
          unestimated++;
        }

        if (l.currency) {
          currencyCount.set(l.currency, (currencyCount.get(l.currency) ?? 0) + 1);
        }
      }

      byStage.push({
        stage,
        conversionProbability: baseProb,
        leadCount: stageLeads.length,
        totalValue: hasValue ? totalValue : null,
        weightedValue,
        unestimatedCount: unestimated,
      });

      totalWeightedValue += weightedValue;
      totalActiveLeads += stageLeads.length;
      totalUnestimated += unestimated;
    }

    // Pick dominant currency (most common non-null currency).
    let dominantCurrency: string | null = null;
    let maxCount = 0;
    for (const [currency, count] of currencyCount) {
      if (count > maxCount) { maxCount = count; dominantCurrency = currency; }
    }

    return {
      totalWeightedValue,
      dominantCurrency,
      totalActiveLeads,
      totalUnestimated,
      byStage,
      computedAt: new Date().toISOString(),
    };
  }
}
