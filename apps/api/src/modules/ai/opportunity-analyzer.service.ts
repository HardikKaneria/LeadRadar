import { Inject, Injectable } from '@nestjs/common';
import {
  analyzeOpportunity,
  buildHeuristicScoringStrategy,
  type AiCallContext,
  type AiCallRecord,
  type AnalyzerCompanyProfile,
  type AnalyzerDiscovery,
  type BadLeadRule,
  type BadLeadRules,
} from '@radar/ai';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AiProviderPoolService } from './ai-provider-pool.service';
import { ScoringStrategyService } from './scoring-strategy.service';

type DiscoveryRow = Database['public']['Tables']['discoveries']['Row'];
type CompanyProfileRow = Database['public']['Tables']['company_profiles']['Row'];
type AiAnalysisRow = Database['public']['Tables']['ai_analysis']['Row'];

const BAD_LEAD_FIELDS = new Set(['industry', 'country', 'keyword', 'company_name', 'budget', 'website']);
const BAD_LEAD_OPERATORS = new Set(['equals', 'contains', 'in', 'lt', 'gt', 'exists', 'not_exists']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mapBadLeadRules(value: Json | null | undefined): BadLeadRules {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return { logic: 'any', rules: [] };
  }
  const rules = value.rules.flatMap((entry): BadLeadRule[] => {
    if (!isRecord(entry)) return [];
    if (!BAD_LEAD_FIELDS.has(String(entry.field)) || !BAD_LEAD_OPERATORS.has(String(entry.operator))) {
      return [];
    }
    return [
      {
        field: entry.field as BadLeadRule['field'],
        operator: entry.operator as BadLeadRule['operator'],
        value: entry.value as BadLeadRule['value'],
      },
    ];
  });
  return { logic: value.logic === 'all' ? 'all' : 'any', rules };
}

export function mapCompanyProfile(row: CompanyProfileRow | null): AnalyzerCompanyProfile {
  const idealCustomer = row && isRecord(row.ideal_customer) ? row.ideal_customer : null;
  const summary =
    idealCustomer && typeof idealCustomer.summary === 'string' && idealCustomer.summary.trim().length
      ? idealCustomer.summary.trim()
      : null;

  return {
    services: row?.services ?? [],
    priorityServices: row?.priority_services ?? [],
    targetIndustries: row?.target_industries ?? [],
    targetCountries: row?.target_countries ?? [],
    minBudget: row?.min_budget ?? null,
    idealCustomerSummary: summary,
    badLeadRules: mapBadLeadRules(row?.bad_lead_rules),
  };
}

function mapDiscovery(row: DiscoveryRow): AnalyzerDiscovery {
  return {
    title: row.title,
    description: row.description,
    companyName: row.company_name,
    contactName: row.contact_name,
    country: row.country,
    website: row.website,
    email: row.email,
    source: row.source,
    budgetHint: row.budget_hint,
  };
}

/**
 * Opportunity Analyzer writer (P3-06). Loads the discovery + active Company Brain + active scoring
 * strategy, runs the pure `@radar/ai` analyzer through the live gateway, and persists the result to
 * `ai_analysis` (the latest row per discovery is the head; re-analysis keeps history). The async
 * job lifecycle + status transitions are P3-07.
 */
@Injectable()
export class OpportunityAnalyzerService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly pool: AiProviderPoolService,
    private readonly strategies: ScoringStrategyService,
  ) {}

  async analyzeDiscovery(
    organizationId: string,
    discoveryId: string,
    userId: string,
  ): Promise<AiAnalysisRow> {
    const discovery = await this.loadDiscovery(organizationId, discoveryId);
    const profile = mapCompanyProfile(await this.loadActiveProfile(organizationId));
    const activeStrategy = await this.strategies.loadActiveStrategy(organizationId);
    const strategy = buildHeuristicScoringStrategy(activeStrategy.weights);

    // Capture the last successful provider call so we can record the prompt version + model used.
    let lastCall: AiCallRecord | undefined;
    const ai = await this.pool.buildService({
      organizationId,
      hooks: {
        onCall: (record) => {
          if (record.status !== 'error') lastCall = record;
        },
      },
    });

    // 1. Ensure discovery has an embedding for similarity search
    let embeddingVector: number[] | null = null;
    try {
      if (discovery.embedding) {
        // Suppress TS error by asserting it as string then parsing, or just knowing PG returns it as string/array
        embeddingVector = typeof discovery.embedding === 'string' 
          ? JSON.parse(discovery.embedding) 
          : discovery.embedding;
      } else {
        // Generate it inline
        const text = [discovery.title, discovery.description, discovery.company_name, discovery.country]
          .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
          .join('\n');
          
        if (text) {
          const embedAi = await this.pool.buildService({ organizationId });
          const result = await embedAi.embed({ taskType: 'embedding', organizationId, userId }, { input: text });
          embeddingVector = result.vector;
          
          // Optionally save it back to avoid re-computing, though pipeline does it later too
          await this.supabase.from('discoveries')
            .update({ embedding: `[${result.vector.join(',')}]` as any })
            .eq('id', discoveryId);
        }
      }
    } catch (e) {
      // Non-fatal, just means we don't have similarity signals
    }

    // 2. Find similar closed-won opportunities
    let similarityToWon = 0;
    if (embeddingVector) {
      const { data: similar } = await this.supabase.rpc('find_similar_won_opportunities', {
        p_org_id: organizationId,
        p_query_embedding: `[${embeddingVector.join(',')}]` as any,
        p_match_count: 1,
        p_match_threshold: 0.70
      });
      if (similar && similar.length > 0) {
        similarityToWon = similar[0].similarity;
      }
    }

    const ctx: AiCallContext = { taskType: 'opportunity_analyzer', organizationId, userId };
    const result = await analyzeOpportunity(ai, ctx, { 
      discovery: mapDiscovery(discovery), 
      profile, 
      strategy,
      similarityToWon,
    });

    return this.insertAnalysis(organizationId, discoveryId, activeStrategy.id, result, lastCall);
  }

  private async insertAnalysis(
    organizationId: string,
    discoveryId: string,
    scoringStrategyId: string,
    result: Awaited<ReturnType<typeof analyzeOpportunity>>,
    lastCall: AiCallRecord | undefined,
  ): Promise<AiAnalysisRow> {
    const payload: Database['public']['Tables']['ai_analysis']['Insert'] = {
      organization_id: organizationId,
      discovery_id: discoveryId,
      score: result.score,
      intent: result.intent,
      urgency: result.urgency,
      service_match: result.serviceMatches as unknown as Json,
      budget_estimate: result.budgetEstimate,
      confidence: result.confidence,
      recommended_action: result.recommendedAction,
      reason: result.reason,
      is_bad_lead: result.isBadLead,
      scoring_strategy_id: scoringStrategyId,
      ai_prompt_version_id: lastCall?.aiPromptVersionId ?? null,
      model_meta: lastCall ? { provider: lastCall.provider, model: lastCall.model } : {},
    };

    const { data, error } = await this.supabase.from('ai_analysis').insert(payload).select('*').single();
    if (error || !data) {
      throw new Error(`Failed to insert ai_analysis row: ${error?.message ?? 'unknown error'}`);
    }
    return data as AiAnalysisRow;
  }

  private async loadDiscovery(organizationId: string, discoveryId: string): Promise<DiscoveryRow> {
    const { data, error } = await this.supabase
      .from('discoveries')
      .select('*')
      .eq('id', discoveryId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load discovery ${discoveryId}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`Discovery ${discoveryId} not found for organization ${organizationId}`);
    }
    return data as DiscoveryRow;
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

  public async embedOpportunity(organizationId: string, opportunityId: string, userId: string): Promise<number> {
    const { data: opportunity, error } = await this.supabase
      .from('opportunities')
      .select('*')
      .eq('id', opportunityId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !opportunity) {
      throw new Error(`Opportunity ${opportunityId} not found or failed to load`);
    }

    const text = [opportunity.title, opportunity.description, opportunity.ai_explanation]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join('\n');

    if (!text) {
      // Nothing to embed
      return 0;
    }

    const ai = await this.pool.buildService({ organizationId });
    const result = await ai.embed({ taskType: 'embedding', organizationId, userId }, { input: text });

    const vectorLiteral = `[${result.vector.join(',')}]`;

    const { error: updateError } = await this.supabase
      .from('opportunities')
      .update({ embedding: vectorLiteral as unknown as number[] } as never)
      .eq('id', opportunityId)
      .eq('organization_id', organizationId);

    if (updateError) {
      throw new Error(`Failed to store embedding for ${opportunityId}: ${updateError.message}`);
    }

    return result.vector.length;
  }

  public async findSimilarOpportunities(organizationId: string, opportunityId: string): Promise<any[]> {
    // 1. Load the opportunity's embedding
    const { data: opp, error: oppError } = await this.supabase
      .from('opportunities')
      .select('embedding')
      .eq('id', opportunityId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle();

    if (oppError || !opp) {
      throw new Error(`Opportunity ${opportunityId} not found`);
    }

    if (!opp.embedding) {
      // Embedding not generated yet. Trigger generation? We can just return empty array for now.
      return [];
    }

    // 2. Call the RPC to find similar
    const { data, error } = await this.supabase
      .rpc('find_similar_opportunities', {
        p_org_id: organizationId,
        p_query_embedding: opp.embedding as unknown as string, // PG handles string formatted vectors
        p_match_count: 5,
        p_match_threshold: 0.75,
        p_exclude_id: opportunityId,
      });

    if (error) {
      throw new Error(`Failed to find similar opportunities: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      score: row.score,
      potentialValue: row.potential_value,
      heatScore: row.heat_score,
      similarity: row.similarity,
    }));
  }

  public async getDemandRadar(organizationId: string, daysBack: number = 30): Promise<any[]> {
    const { data, error } = await this.supabase
      .rpc('get_demand_radar', {
        p_organization_id: organizationId,
        p_days_back: daysBack,
        p_similarity_threshold: 0.15,
      });

    if (error) {
      throw new Error(`Failed to get demand radar: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      clusterId: row.cluster_id,
      title: row.title,
      volume: row.volume,
      velocity: row.velocity,
      avgScore: row.avg_score,
    }));
  }
}
