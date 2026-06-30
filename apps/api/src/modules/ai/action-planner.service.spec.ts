import { AIService, FakeProvider, type PromptResolver, type TaskRoute } from '@radar/ai';
import type { Database, ServiceClient } from '@radar/supabase';
import { ActionPlannerService, mapAnalysis } from './action-planner.service';
import type { AiProviderPoolService } from './ai-provider-pool.service';

type DiscoveryRow = Database['public']['Tables']['discoveries']['Row'];
type AiAnalysisRow = Database['public']['Tables']['ai_analysis']['Row'];
type AiActionPlanInsert = Database['public']['Tables']['ai_action_plans']['Insert'];

const route: TaskRoute = {
  taskType: 'action_planner',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

const planOutput = JSON.stringify({
  recommendedAction: 'Send a tailored intro email with two relevant case studies',
  reason: 'Email is the least-friction first touch for this discovery',
  plannedTask: {
    title: 'Draft and send intro email',
    type: 'email',
    notes: 'Mention WooCommerce rebuild and CRO support.',
  },
});

function discoveryRow(overrides: Partial<DiscoveryRow> = {}): DiscoveryRow {
  return {
    id: 'disc-1',
    organization_id: 'org-1',
    batch_id: null,
    source: 'upwork',
    status: 'analyzed',
    raw_payload: {},
    title: 'WooCommerce rebuild',
    description: 'Need a faster storefront',
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
    created_at: '2026-06-24T00:00:00.000Z',
    updated_at: '2026-06-24T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function analysisRow(overrides: Partial<AiAnalysisRow> = {}): AiAnalysisRow {
  return {
    id: 'analysis-1',
    organization_id: 'org-1',
    discovery_id: 'disc-1',
    score: 88,
    intent: 'high',
    urgency: 'urgent',
    service_match: [{ service: 'web', confidence: 0.9, isPriority: true }],
    budget_estimate: 12000,
    confidence: 0.82,
    recommended_action: 'Reach out today',
    reason: 'Strong service and budget fit',
    is_bad_lead: false,
    scoring_strategy_id: 'strategy-1',
    ai_prompt_version_id: 'prompt-analyzer',
    model_meta: { provider: 'fake', model: 'fake-analyzer' },
    created_at: '2026-06-24T00:00:00.000Z',
    ...overrides,
  };
}

function makeSupabase(opts: {
  discovery: DiscoveryRow | null;
  analysis: AiAnalysisRow | null;
  onInsert: (payload: AiActionPlanInsert) => void;
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
    if (table === 'ai_analysis') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: opts.analysis, error: null }),
      });
      return chain;
    }
    if (table === 'ai_action_plans') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        insert: (payload: AiActionPlanInsert) => {
          opts.onInsert(payload);
          return chain;
        },
        select: () => chain,
        single: () => Promise.resolve({ data: { id: 'plan-1' }, error: null }),
      });
      return chain;
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { from } as unknown as ServiceClient;
}

function makeService(opts: {
  discovery: DiscoveryRow | null;
  analysis: AiAnalysisRow | null;
  responder?: () => string;
  resolvePrompt?: PromptResolver;
  onInsert: (payload: AiActionPlanInsert) => void;
}): ActionPlannerService {
  const supabase = makeSupabase(opts);
  const pool = {
    buildService: async (options: { hooks?: { onCall?: (r: unknown) => void } } = {}) =>
      new AIService({
        providers: [new FakeProvider({ responder: opts.responder ?? (() => planOutput) })],
        routes: { action_planner: route },
        resolvePrompt: opts.resolvePrompt,
        hooks: options.hooks,
      }),
  } as unknown as AiProviderPoolService;

  return new ActionPlannerService(supabase, pool);
}

describe('mapAnalysis', () => {
  it('maps ai_analysis rows into planner input', () => {
    const mapped = mapAnalysis(analysisRow());
    expect(mapped.score).toBe(88);
    expect(mapped.serviceMatches).toEqual([{ service: 'web', confidence: 0.9, isPriority: true }]);
    expect(mapped.isBadLead).toBe(false);
  });
});

describe('ActionPlannerService.planDiscovery', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-24T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('persists a planned action with priority, due date, and prompt/model metadata', async () => {
    let payload: AiActionPlanInsert | undefined;
    const service = makeService({
      discovery: discoveryRow(),
      analysis: analysisRow(),
      onInsert: (inserted) => {
        payload = inserted;
      },
    });

    const row = await service.planDiscovery('org-1', 'disc-1', 'user-1');
    expect(row.id).toBe('plan-1');
    expect(payload).toBeDefined();
    expect(payload!.ai_analysis_id).toBe('analysis-1');
    expect(payload!.priority).toBe('critical');
    expect(payload!.priority_weight).toBe(100);
    expect(payload!.due_at).toBe('2026-06-24T04:00:00.000Z');
    expect(payload!.planned_task_type).toBe('email');
    expect(payload!.ai_prompt_version_id).toBeNull();
    expect(payload!.model_meta).toEqual({ provider: 'fake', model: 'fake-1' });
  });

  it('short-circuits bad leads without a model call', async () => {
    let payload: AiActionPlanInsert | undefined;
    let responderCalls = 0;
    const service = makeService({
      discovery: discoveryRow(),
      analysis: analysisRow({ is_bad_lead: true, reason: 'Outside ICP and below budget' }),
      responder: () => {
        responderCalls += 1;
        return planOutput;
      },
      onInsert: (inserted) => {
        payload = inserted;
      },
    });

    await service.planDiscovery('org-1', 'disc-1', 'user-1');
    expect(responderCalls).toBe(0);
    expect(payload!.priority).toBe('low');
    expect(payload!.planned_task_type).toBe('custom');
    expect(payload!.ai_prompt_version_id).toBeNull();
    expect(payload!.model_meta).toEqual({});
  });

  it('persists the resolved prompt version after a structured-output repair pass', async () => {
    let payload: AiActionPlanInsert | undefined;
    let responderCalls = 0;
    const service = makeService({
      discovery: discoveryRow(),
      analysis: analysisRow(),
      responder: () => {
        responderCalls += 1;
        return responderCalls === 1 ? 'not json' : planOutput;
      },
      resolvePrompt: () => ({ promptVersionId: 'prompt-plan-v1' }),
      onInsert: (inserted) => {
        payload = inserted;
      },
    });

    await service.planDiscovery('org-1', 'disc-1', 'user-1');
    expect(responderCalls).toBe(2);
    expect(payload!.ai_prompt_version_id).toBe('prompt-plan-v1');
    expect(payload!.model_meta).toEqual({ provider: 'fake', model: 'fake-1' });
  });

  it('throws when there is no analysis to plan from', async () => {
    const service = makeService({
      discovery: discoveryRow(),
      analysis: null,
      onInsert: () => undefined,
    });

    await expect(service.planDiscovery('org-1', 'disc-1', 'user-1')).rejects.toThrow('No ai_analysis row found');
  });
});
