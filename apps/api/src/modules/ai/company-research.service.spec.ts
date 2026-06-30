import { AIService, FakeProvider, type PromptResolver, type TaskRoute } from '@radar/ai';
import type { Database, ServiceClient } from '@radar/supabase';
import { CompanyResearchService } from './company-research.service';
import type { AiProviderPoolService } from './ai-provider-pool.service';

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CompanyUpdate = Database['public']['Tables']['companies']['Update'];

const route: TaskRoute = {
  taskType: 'company_research',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

const goodOutput = JSON.stringify({
  summary: 'A B2B SaaS company investing in analytics.',
  industry: 'B2B SaaS',
  techStack: ['React', 'Postgres'],
  problems: ['Aging dashboard'],
  suggestedServices: ['Frontend replatforming'],
});

function companyRow(overrides: Partial<CompanyRow> = {}): CompanyRow {
  return {
    id: 'co-1',
    organization_id: 'org-1',
    name: 'Northwind Labs',
    domain: 'northwind.io',
    industry: null,
    country: 'United States',
    size: null,
    tech_stack: [],
    enrichment: {},
    created_by: null,
    created_at: '2026-06-24T00:00:00.000Z',
    updated_at: '2026-06-24T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function makeSupabase(opts: {
  company: CompanyRow | null;
  opportunities?: { title: string }[];
  onUpdate: (patch: CompanyUpdate) => void;
}) {
  const from = jest.fn((table: string) => {
    if (table === 'companies') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: () => Promise.resolve({ data: opts.company, error: null }),
        update: (patch: CompanyUpdate) => {
          opts.onUpdate(patch);
          return chain;
        },
        single: () =>
          Promise.resolve({ data: { ...(opts.company as CompanyRow), id: 'co-1' }, error: null }),
      });
      return chain;
    }
    if (table === 'opportunities') {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: opts.opportunities ?? [], error: null }),
      });
      return chain;
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from } as unknown as ServiceClient;
}

function makeService(opts: {
  company: CompanyRow | null;
  opportunities?: { title: string }[];
  responder?: () => string;
  resolvePrompt?: PromptResolver;
  onUpdate: (patch: CompanyUpdate) => void;
}): CompanyResearchService {
  const supabase = makeSupabase(opts);
  const pool = {
    buildService: async (options: { hooks?: { onCall?: (r: unknown) => void } } = {}) =>
      new AIService({
        providers: [new FakeProvider({ responder: opts.responder ?? (() => goodOutput) })],
        routes: { company_research: route },
        resolvePrompt: opts.resolvePrompt,
        hooks: options.hooks,
      }),
  } as unknown as AiProviderPoolService;
  return new CompanyResearchService(supabase, pool);
}

describe('CompanyResearchService.researchCompany', () => {
  it('writes enrichment and back-fills empty industry/tech_stack with model metadata', async () => {
    let patch: CompanyUpdate | undefined;
    const service = makeService({
      company: companyRow(),
      opportunities: [{ title: 'Replatform the dashboard' }],
      onUpdate: (p) => {
        patch = p;
      },
    });

    await service.researchCompany('org-1', 'co-1', 'user-1');

    expect(patch).toBeDefined();
    const enrichment = patch!.enrichment as Record<string, unknown>;
    expect(enrichment.summary).toBe('A B2B SaaS company investing in analytics.');
    expect(enrichment.techStack).toEqual(['React', 'Postgres']);
    expect(enrichment.model).toEqual({ provider: 'fake', model: 'fake-1' });
    // industry + tech_stack were empty, so they get back-filled.
    expect(patch!.industry).toBe('B2B SaaS');
    expect(patch!.tech_stack).toEqual(['React', 'Postgres']);
  });

  it('does not clobber an existing industry or tech stack', async () => {
    let patch: CompanyUpdate | undefined;
    const service = makeService({
      company: companyRow({ industry: 'Fintech', tech_stack: ['Vue'] }),
      onUpdate: (p) => {
        patch = p;
      },
    });

    await service.researchCompany('org-1', 'co-1', 'user-1');

    expect(patch!.enrichment).toBeDefined();
    expect(patch!.industry).toBeUndefined();
    expect(patch!.tech_stack).toBeUndefined();
  });

  it('throws when the company is missing', async () => {
    const service = makeService({ company: null, onUpdate: () => undefined });
    await expect(service.researchCompany('org-1', 'missing', 'user-1')).rejects.toThrow('not found');
  });
});
