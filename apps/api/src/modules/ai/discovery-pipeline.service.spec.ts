import { AIService, FakeProvider, type TaskRoute } from '@radar/ai';
import type { Database, ServiceClient } from '@radar/supabase';
import { DiscoveryPipelineService } from './discovery-pipeline.service';
import type { ActionPlannerService } from './action-planner.service';
import type { AiProviderPoolService } from './ai-provider-pool.service';
import type { CompanyResearchService } from './company-research.service';
import type { OpportunityAnalyzerService } from './opportunity-analyzer.service';
import type { ProposalService } from './proposal.service';
import type { JobsService } from '../jobs/jobs.service';

type DiscoveryRow = Database['public']['Tables']['discoveries']['Row'];

const embedRoute: TaskRoute = {
  taskType: 'embedding',
  attempts: [{ provider: 'fake', model: 'fake-embed' }],
  requiresEmbedding: true,
};

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

interface Captured {
  statuses: string[];
  jobRuns: Record<string, unknown>[];
  embedding?: unknown;
}

function makeSupabase(discovery: DiscoveryRow | null): { client: ServiceClient; captured: Captured } {
  const captured: Captured = { statuses: [], jobRuns: [] };

  const discoveriesChain: Record<string, unknown> = {
    select: () => discoveriesChain,
    update: (patch: Record<string, unknown>) => {
      if (typeof patch.status === 'string') captured.statuses.push(patch.status);
      if ('embedding' in patch) captured.embedding = patch.embedding;
      return discoveriesChain;
    },
    eq: () => discoveriesChain,
    is: () => discoveriesChain,
    maybeSingle: () => Promise.resolve({ data: discovery, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
  };

  const jobRunsChain: Record<string, unknown> = {
    update: (patch: Record<string, unknown>) => {
      captured.jobRuns.push(patch);
      return jobRunsChain;
    },
    eq: () => jobRunsChain,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
  };

  const from = jest.fn((table: string) => {
    if (table === 'discoveries') return discoveriesChain;
    if (table === 'job_runs') return jobRunsChain;
    throw new Error(`unexpected table ${table}`);
  });

  return { client: { from } as unknown as ServiceClient, captured };
}

function makeService(opts: {
  discovery: DiscoveryRow | null;
  analyze?: jest.Mock;
  plan?: jest.Mock;
  enqueue?: jest.Mock;
}): { service: DiscoveryPipelineService; captured: Captured; enqueue: jest.Mock; analyze: jest.Mock; plan: jest.Mock } {
  const { client, captured } = makeSupabase(opts.discovery);
  const analyze = opts.analyze ?? jest.fn().mockResolvedValue({ id: 'a1', score: 80, is_bad_lead: false });
  const plan =
    opts.plan ??
    jest.fn().mockResolvedValue({ id: 'plan-1', priority: 'high', due_at: '2026-06-24T12:00:00.000Z' });
  const enqueue = opts.enqueue ?? jest.fn().mockResolvedValue({ jobId: 'job-2' });

  const jobs = { enqueue } as unknown as JobsService;
  const analyzer = { analyzeDiscovery: analyze } as unknown as OpportunityAnalyzerService;
  const planner = { planDiscovery: plan } as unknown as ActionPlannerService;
  const research = { researchCompany: jest.fn() } as unknown as CompanyResearchService;
  const proposals = { generateProposal: jest.fn() } as unknown as ProposalService;
  const pool = {
    buildService: async () =>
      new AIService({
        providers: [new FakeProvider({ embedDims: 8 })],
        routes: { embedding: embedRoute },
      }),
  } as unknown as AiProviderPoolService;

  return {
    service: new DiscoveryPipelineService(client, jobs, analyzer, planner, research, proposals, pool),
    captured,
    enqueue,
    analyze,
    plan,
  };
}

describe('DiscoveryPipelineService.runAnalyze', () => {
  it('transitions new→processing→analyzed, records the job, and chains embedding', async () => {
    const { service, captured, enqueue, plan } = makeService({ discovery: discoveryRow() });

    await service.runAnalyze({ jobRunId: 'jr-1', organizationId: 'org-1', payload: { discoveryId: 'disc-1', userId: 'user-1' } });

    expect(captured.statuses).toEqual(['processing', 'analyzed']);
    expect(plan).toHaveBeenCalledWith('org-1', 'disc-1', 'user-1');
    expect(captured.jobRuns[0]).toMatchObject({ status: 'running' });
    expect(captured.jobRuns.at(-1)).toMatchObject({ status: 'completed', progress: 100 });
    expect((captured.jobRuns.at(-1) as { result: { analysisId: string; actionPlanId: string } }).result).toMatchObject({
      analysisId: 'a1',
      actionPlanId: 'plan-1',
    });
    expect(enqueue).toHaveBeenCalledWith('org-1', 'generate-embedding', 'generate-embedding', { discoveryId: 'disc-1', userId: 'user-1' }, { type: 'discovery', id: 'disc-1' });
  });

  it('reverts the discovery to new and rethrows when analysis fails', async () => {
    const analyze = jest.fn().mockRejectedValue(new Error('analyzer boom'));
    const { service, captured } = makeService({ discovery: discoveryRow(), analyze });

    await expect(
      service.runAnalyze({ jobRunId: 'jr-1', organizationId: 'org-1', payload: { discoveryId: 'disc-1', userId: 'user-1' } }),
    ).rejects.toThrow('analyzer boom');
    expect(captured.statuses).toEqual(['processing', 'new']);
  });

  it('keeps the analysis successful when planning fails', async () => {
    const plan = jest.fn().mockRejectedValue(new Error('planner boom'));
    const { service, captured } = makeService({ discovery: discoveryRow(), plan });

    await service.runAnalyze({ jobRunId: 'jr-1', organizationId: 'org-1', payload: { discoveryId: 'disc-1', userId: 'user-1' } });

    expect(captured.statuses).toEqual(['processing', 'analyzed']);
    expect(captured.jobRuns.at(-1)).toMatchObject({
      status: 'completed',
      result: { analysisId: 'a1', actionPlanId: null, plannerError: 'planner boom' },
    });
  });
});

describe('DiscoveryPipelineService.runEmbedding', () => {
  it('embeds the discovery text and stores a pgvector literal', async () => {
    const { service, captured } = makeService({ discovery: discoveryRow() });

    await service.runEmbedding({ jobRunId: 'jr-2', organizationId: 'org-1', payload: { discoveryId: 'disc-1', userId: 'user-1' } });

    expect(typeof captured.embedding).toBe('string');
    expect(captured.embedding as string).toMatch(/^\[.*\]$/);
    expect(captured.jobRuns.at(-1)).toMatchObject({ status: 'completed', result: { dimensions: 8 } });
  });

  it('fails when the discovery has no embeddable text', async () => {
    const { service } = makeService({
      discovery: discoveryRow({ title: null, description: null, company_name: null, country: null }),
    });
    await expect(
      service.runEmbedding({ jobRunId: 'jr-3', organizationId: 'org-1', payload: { discoveryId: 'disc-1', userId: 'user-1' } }),
    ).rejects.toThrow('no embeddable text');
  });
});
