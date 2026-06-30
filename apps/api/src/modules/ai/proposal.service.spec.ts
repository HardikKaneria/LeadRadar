import { AIService, FakeProvider, type PromptResolver, type TaskRoute } from '@radar/ai';
import type { Database, ServiceClient } from '@radar/supabase';
import { ProposalService } from './proposal.service';
import type { AiProviderPoolService } from './ai-provider-pool.service';

type ProposalRow = Database['public']['Tables']['proposals']['Row'];
type ProposalInsert = Database['public']['Tables']['proposals']['Insert'];
type LeadRow = Database['public']['Tables']['leads']['Row'];
type CompanyProfileRow = Database['public']['Tables']['company_profiles']['Row'];

const route: TaskRoute = {
  taskType: 'proposal_generator',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

const goodOutput = JSON.stringify({
  title: 'Web Development Proposal',
  summary: 'We will build a great site.',
  sections: [{ heading: 'Scope', body: 'Build 5 pages' }],
  pricingNote: 'Estimated $10,000',
});

function leadRow(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    id: 'lead-1',
    organization_id: 'org-1',
    opportunity_id: null,
    company_id: null,
    primary_contact_id: null,
    source: 'inbound',
    title: 'Lead 1',
    description: null,
    stage: 'new',
    value: 10000,
    score: 0,
    priority: 'medium',
    priority_weight: 50,
    currency: null,
    owner_id: null,
    close_reason: null,
    closed_at: null,
    created_by: null,
    created_at: '2026-06-23T00:00:00.000Z',
    updated_at: '2026-06-23T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function profileRow(): CompanyProfileRow {
  return {
    id: 'profile-1',
    organization_id: 'org-1',
    version: 1,
    services: ['Web Development'],
    priority_services: [],
    target_industries: [],
    target_countries: [],
    min_budget: null,
    outreach_tone: 'Professional',
    ideal_customer: null,
    bad_lead_rules: null,
    is_active: true,
    created_by: null,
    created_at: '2026-06-23T00:00:00.000Z',
  };
}

function makeSupabase(opts: {
  lead: LeadRow | null;
  profile: CompanyProfileRow | null;
  onInsert: (payload: ProposalInsert) => void;
}) {
  const from = jest.fn((table: string) => {
    if (table === 'leads') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: () => Promise.resolve({ data: opts.lead, error: null }),
      });
      return chain;
    }
    if (table === 'opportunities') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
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
    if (table === 'companies' || table === 'contacts') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      });
      return chain;
    }
    if (table === 'proposals') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        insert: (payload: ProposalInsert) => {
          opts.onInsert(payload);
          return chain;
        },
        select: () => chain,
        single: () =>
          Promise.resolve({
            data: { id: 'prop-1', ...payload } as unknown as ProposalRow,
            error: null,
          }),
      });
      let payload: ProposalInsert;
      chain.insert = (p: ProposalInsert) => {
        payload = p;
        opts.onInsert(p);
        return chain;
      };
      return chain;
    }
    throw new Error(`Unhandled table: ${table}`);
  });

  return { from } as unknown as ServiceClient;
}

function makePool(ai: AIService) {
  return {
    buildService: jest.fn().mockResolvedValue(ai),
  } as unknown as AiProviderPoolService;
}

describe('ProposalService', () => {
  let fakeProvider: FakeProvider;
  let aiService: AIService;
  const resolver: PromptResolver = jest.fn().mockResolvedValue({
    id: 'version-1',
    template: 'test prompt',
    model_config: {},
  });

  beforeEach(() => {
    fakeProvider = new FakeProvider();
    aiService = new AIService({
      providers: [fakeProvider],
      routes: { proposal_generator: route },
      resolvePrompt: resolver,
    });
  });

  it('generates and persists a proposal', async () => {
    fakeProvider = new FakeProvider({ responder: () => goodOutput });
    aiService = new AIService({
      providers: [fakeProvider],
      routes: { proposal_generator: route },
      resolvePrompt: resolver,
    });

    const inserted: ProposalInsert[] = [];
    const supabase = makeSupabase({
      lead: leadRow(),
      profile: profileRow(),
      onInsert: (p) => inserted.push(p),
    });
    const pool = makePool(aiService);
    const service = new ProposalService(supabase, pool);

    const result = await service.generateProposal('org-1', 'lead', 'lead-1', 'user-1');

    expect(result.id).toBe('prop-1');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.status).toBe('ready');
    expect(inserted[0]?.title).toBe('Web Development Proposal');
    expect(inserted[0]?.created_by).toBe('user-1');
    expect(inserted[0]?.lead_id).toBe('lead-1');
    expect(inserted[0]?.opportunity_id).toBeNull();
    
    const content = inserted[0]?.content as any;
    expect(content.summary).toBe('We will build a great site.');
    expect(content.sections).toHaveLength(1);
  });
});
