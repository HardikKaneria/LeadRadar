import { AIService, FakeProvider, type PromptResolver, type TaskRoute } from '@radar/ai';
import type { Database, ServiceClient } from '@radar/supabase';
import {
  OpportunityAnalyzerService,
  mapBadLeadRules,
  mapCompanyProfile,
} from './opportunity-analyzer.service';
import type { AiProviderPoolService } from './ai-provider-pool.service';
import type { ActiveScoringStrategy, ScoringStrategyService } from './scoring-strategy.service';

type DiscoveryRow = Database['public']['Tables']['discoveries']['Row'];
type CompanyProfileRow = Database['public']['Tables']['company_profiles']['Row'];
type AiAnalysisInsert = Database['public']['Tables']['ai_analysis']['Insert'];

const route: TaskRoute = {
  taskType: 'opportunity_analyzer',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

const goodOutput = JSON.stringify({
  intent: 'high',
  urgency: 'soon',
  budgetFit: 'above_min',
  budgetEstimate: 12000,
  serviceMatches: [{ service: 'web', confidence: 0.9, isPriority: true }],
  confidence: 0.8,
  recommendedAction: 'Reach out today',
  reason: 'Strong service + budget fit',
});

function discoveryRow(overrides: Partial<DiscoveryRow> = {}): DiscoveryRow {
  return {
    id: 'disc-1',
    organization_id: 'org-1',
    batch_id: null,
    source: 'upwork',
    status: 'new',
    raw_payload: {},
    title: 'Marketing site rebuild',
    description: 'Need a new site',
    company_name: 'Acme',
    contact_name: null,
    email: null,
    phone: null,
    website: null,
    country: 'US',
    budget_hint: 12000,
    dedup_hash: null,
    embedding: null,
    created_by: null,
    created_at: '2026-06-23T00:00:00.000Z',
    updated_at: '2026-06-23T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

const activeStrategy: ActiveScoringStrategy = {
  id: 'strategy-1',
  organizationId: 'org-1',
  version: 1,
  kind: 'heuristic',
  weights: {
    serviceMatch: 20,
    priorityServiceMatch: 15,
    countryMatch: 10,
    budgetFit: { above_min: 10, below_min: -15, unknown: 0 },
    intent: { high: 20, medium: 10, low: -10, unclear: 0 },
    urgency: { urgent: 15, soon: 8, later: 3, none: 0 },
    similarityToWon: 10,
  },
  metrics: {},
  createdAt: '2026-06-23T00:00:00.000Z',
};

function makeSupabase(opts: {
  discovery: DiscoveryRow | null;
  profile: CompanyProfileRow | null;
  onInsert: (payload: AiAnalysisInsert) => void;
}) {
  const from = jest.fn((table: string) => {
    if (table === 'discoveries') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: () => Promise.resolve({ data: opts.discovery, error: null }),
      });
      return chain;
    }
    if (table === 'company_profiles') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: opts.profile, error: null }),
      });
      return chain;
    }
    if (table === 'ai_analysis') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        insert: (payload: AiAnalysisInsert) => {
          opts.onInsert(payload);
          return chain;
        },
        select: () => chain,
        single: () => Promise.resolve({ data: { id: 'analysis-1' }, error: null }),
      });
      return chain;
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from } as unknown as ServiceClient;
}

function makeService(opts: {
  discovery: DiscoveryRow | null;
  profile: CompanyProfileRow | null;
  responder?: () => string;
  resolvePrompt?: PromptResolver;
  onInsert: (payload: AiAnalysisInsert) => void;
}): OpportunityAnalyzerService {
  const supabase = makeSupabase(opts);
  const pool = {
    buildService: async (options: { hooks?: { onCall?: (r: unknown) => void } } = {}) =>
      new AIService({
        providers: [new FakeProvider({ responder: opts.responder ?? (() => goodOutput) })],
        routes: { opportunity_analyzer: route },
        resolvePrompt: opts.resolvePrompt,
        hooks: options.hooks,
      }),
  } as unknown as AiProviderPoolService;
  const strategies = {
    loadActiveStrategy: async () => activeStrategy,
  } as unknown as ScoringStrategyService;
  return new OpportunityAnalyzerService(supabase, pool, strategies);
}

describe('mapBadLeadRules', () => {
  it('returns an empty rule set for non-object input', () => {
    expect(mapBadLeadRules(null)).toEqual({ logic: 'any', rules: [] });
    expect(mapBadLeadRules('nope' as never)).toEqual({ logic: 'any', rules: [] });
  });

  it('keeps valid rules and drops unknown fields/operators', () => {
    const mapped = mapBadLeadRules({
      logic: 'all',
      rules: [
        { field: 'budget', operator: 'lt', value: 500 },
        { field: 'made_up', operator: 'lt', value: 1 },
        { field: 'country', operator: 'banana', value: 'x' },
      ],
    } as never);
    expect(mapped.logic).toBe('all');
    expect(mapped.rules).toEqual([{ field: 'budget', operator: 'lt', value: 500 }]);
  });
});

describe('mapCompanyProfile', () => {
  it('falls back to empty defaults when there is no active profile', () => {
    expect(mapCompanyProfile(null)).toEqual({
      services: [],
      priorityServices: [],
      targetIndustries: [],
      targetCountries: [],
      minBudget: null,
      idealCustomerSummary: null,
      badLeadRules: { logic: 'any', rules: [] },
    });
  });

  it('maps row fields and the ideal-customer summary', () => {
    const profile = mapCompanyProfile({
      id: 'cp-1',
      organization_id: 'org-1',
      version: 2,
      is_active: true,
      services: ['web'],
      priority_services: ['web'],
      target_industries: ['saas'],
      ideal_customer: { summary: 'Mid-market SaaS' },
      target_countries: ['US'],
      min_budget: 5000,
      bad_lead_rules: { logic: 'any', rules: [{ field: 'budget', operator: 'lt', value: 1000 }] },
      outreach_tone: null,
      created_by: null,
      created_at: '2026-06-23T00:00:00.000Z',
    } as CompanyProfileRow);

    expect(profile.services).toEqual(['web']);
    expect(profile.minBudget).toBe(5000);
    expect(profile.idealCustomerSummary).toBe('Mid-market SaaS');
    expect(profile.badLeadRules.rules).toHaveLength(1);
  });
});

describe('OpportunityAnalyzerService.analyzeDiscovery', () => {
  it('persists an AI-scored analysis with the strategy + prompt/model metadata', async () => {
    let payload: AiAnalysisInsert | undefined;
    const service = makeService({
      discovery: discoveryRow(),
      profile: null,
      onInsert: (p) => {
        payload = p;
      },
    });

    const row = await service.analyzeDiscovery('org-1', 'disc-1', 'user-1');
    expect(row.id).toBe('analysis-1');
    expect(payload).toBeDefined();
    expect(payload!.is_bad_lead).toBe(false);
    expect(payload!.intent).toBe('high');
    expect(payload!.score).toBeGreaterThan(0);
    expect(payload!.scoring_strategy_id).toBe('strategy-1');
    expect(payload!.model_meta).toEqual({ provider: 'fake', model: 'fake-1' });
  });

  it('short-circuits a bad lead without a model call', async () => {
    let payload: AiAnalysisInsert | undefined;
    let responderCalls = 0;
    const service = makeService({
      discovery: discoveryRow({ budget_hint: 100 }),
      profile: {
        id: 'cp-1',
        organization_id: 'org-1',
        version: 1,
        is_active: true,
        services: [],
        priority_services: [],
        target_industries: [],
        ideal_customer: {},
        target_countries: [],
        min_budget: 5000,
        bad_lead_rules: { logic: 'any', rules: [{ field: 'budget', operator: 'lt', value: 500 }] },
        outreach_tone: null,
        created_by: null,
        created_at: '2026-06-23T00:00:00.000Z',
      } as CompanyProfileRow,
      responder: () => {
        responderCalls += 1;
        return goodOutput;
      },
      onInsert: (p) => {
        payload = p;
      },
    });

    await service.analyzeDiscovery('org-1', 'disc-1', 'user-1');
    expect(responderCalls).toBe(0);
    expect(payload!.is_bad_lead).toBe(true);
    expect(payload!.score).toBe(0);
    expect(payload!.ai_prompt_version_id).toBeNull();
    expect(payload!.model_meta).toEqual({});
  });

  it('persists the resolved prompt version after a structured-output repair pass', async () => {
    let payload: AiAnalysisInsert | undefined;
    let responderCalls = 0;
    const service = makeService({
      discovery: discoveryRow(),
      profile: null,
      responder: () => {
        responderCalls += 1;
        return responderCalls === 1 ? 'not json' : goodOutput;
      },
      resolvePrompt: () => ({ promptVersionId: 'prompt-v2' }),
      onInsert: (p) => {
        payload = p;
      },
    });

    await service.analyzeDiscovery('org-1', 'disc-1', 'user-1');
    expect(responderCalls).toBe(2);
    expect(payload!.ai_prompt_version_id).toBe('prompt-v2');
    expect(payload!.model_meta).toEqual({ provider: 'fake', model: 'fake-1' });
  });

  it('throws when the discovery is missing', async () => {
    const service = makeService({ discovery: null, profile: null, onInsert: () => undefined });
    await expect(service.analyzeDiscovery('org-1', 'missing', 'user-1')).rejects.toThrow('not found');
  });
});
