import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  QUEUES,
  type AnalyzeDiscoveryJobPayload,
  type GenerateEmbeddingJobPayload,
  type GenerateProposalJobPayload,
  type JobAccepted,
  type ResearchCompanyJobPayload,
} from '@radar/contracts';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { JobsService } from '../jobs/jobs.service';
import { ActionPlannerService } from './action-planner.service';
import { AiProviderPoolService } from './ai-provider-pool.service';
import { CompanyResearchService } from './company-research.service';
import { OpportunityAnalyzerService } from './opportunity-analyzer.service';
import { ProposalService } from './proposal.service';

type DiscoveryRow = Database['public']['Tables']['discoveries']['Row'];
type DiscoveryStatus = DiscoveryRow['status'];

/** A pipeline job body as enqueued by `JobsService.enqueue`. */
export interface PipelineJob<TPayload> {
  jobRunId: string;
  organizationId: string;
  payload: TPayload;
}

/** pgvector accepts its bracketed text form; supabase-js sends it through as the column value. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Drives the async analysis pipeline (P3-07): enqueues + runs the `analyze-discovery` and
 * `generate-embedding` jobs, owns the `new → processing → analyzed` discovery transitions, and
 * keeps `job_runs` in sync. The heavy gateway work is reused from `OpportunityAnalyzerService`,
 * `ActionPlannerService`, and `AiProviderPoolService`; this service only orchestrates the job
 * lifecycle ([[D-025]]).
 */
@Injectable()
export class DiscoveryPipelineService {
  private readonly logger = new Logger(DiscoveryPipelineService.name);

  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly jobs: JobsService,
    private readonly analyzer: OpportunityAnalyzerService,
    private readonly planner: ActionPlannerService,
    private readonly research: CompanyResearchService,
    private readonly proposals: ProposalService,
    private readonly pool: AiProviderPoolService,
  ) {}

  async enqueueAnalysis(organizationId: string, discoveryId: string, userId: string): Promise<JobAccepted> {
    const payload: AnalyzeDiscoveryJobPayload = { discoveryId, userId };
    return this.jobs.enqueue(organizationId, QUEUES.analyzeDiscovery, 'analyze-discovery', payload, {
      type: 'discovery',
      id: discoveryId,
    });
  }

  async enqueueEmbedding(organizationId: string, discoveryId: string, userId: string): Promise<JobAccepted> {
    const payload: GenerateEmbeddingJobPayload = { discoveryId, userId };
    return this.jobs.enqueue(organizationId, QUEUES.generateEmbedding, 'generate-embedding', payload, {
      type: 'discovery',
      id: discoveryId,
    });
  }

  async enqueueCompanyResearch(
    organizationId: string,
    companyId: string,
    userId: string,
  ): Promise<JobAccepted> {
    const payload: ResearchCompanyJobPayload = { companyId, userId };
    return this.jobs.enqueue(organizationId, QUEUES.researchCompany, 'research-company', payload, {
      type: 'company',
      id: companyId,
    });
  }

  async enqueueGenerateProposal(
    organizationId: string,
    entityType: 'lead' | 'opportunity',
    entityId: string,
    userId: string,
  ): Promise<JobAccepted> {
    const payload: GenerateProposalJobPayload = { entityType, entityId, userId };
    return this.jobs.enqueue(organizationId, QUEUES.generateProposal, 'generate-proposal', payload, {
      type: entityType,
      id: entityId,
    });
  }

  async runGenerateProposal(job: PipelineJob<GenerateProposalJobPayload>): Promise<void> {
    const { jobRunId, organizationId, payload } = job;
    await this.markRunning(jobRunId, 20);
    const proposal = await this.proposals.generateProposal(
      organizationId,
      payload.entityType,
      payload.entityId,
      payload.userId,
    );
    await this.markCompleted(jobRunId, { proposalId: proposal.id, title: proposal.title });
  }

  async runCompanyResearch(job: PipelineJob<ResearchCompanyJobPayload>): Promise<void> {
    const { jobRunId, organizationId, payload } = job;
    await this.markRunning(jobRunId, 30);
    const company = await this.research.researchCompany(organizationId, payload.companyId, payload.userId);
    await this.markCompleted(jobRunId, { companyId: company.id, industry: company.industry });
  }

  async runAnalyze(job: PipelineJob<AnalyzeDiscoveryJobPayload>): Promise<void> {
    const { jobRunId, organizationId, payload } = job;
    await this.markRunning(jobRunId, 20);
    await this.setDiscoveryStatus(organizationId, payload.discoveryId, 'processing');

    try {
      const analysis = await this.analyzer.analyzeDiscovery(organizationId, payload.discoveryId, payload.userId);
      let actionPlanId: string | null = null;
      let priority: string | null = null;
      let dueAt: string | null = null;
      let plannerError: string | null = null;

      try {
        const plan = await this.planner.planDiscovery(organizationId, payload.discoveryId, payload.userId);
        actionPlanId = plan.id;
        priority = plan.priority;
        dueAt = plan.due_at;
      } catch (error) {
        plannerError = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Action planner failed for ${payload.discoveryId}: ${plannerError}`);
      }

      await this.setDiscoveryStatus(organizationId, payload.discoveryId, 'analyzed');
      // Chain the embedding so analyzed discoveries become searchable without a second trigger.
      await this.enqueueEmbedding(organizationId, payload.discoveryId, payload.userId).catch((error) => {
        this.logger.warn(`Failed to enqueue embedding for ${payload.discoveryId}: ${String(error)}`);
      });
      await this.markCompleted(jobRunId, {
        analysisId: analysis.id,
        actionPlanId,
        score: analysis.score,
        isBadLead: analysis.is_bad_lead,
        priority,
        dueAt,
        plannerError,
      });
    } catch (error) {
      // Revert so a retry re-analyzes from a clean state instead of staying stuck in "processing".
      await this.setDiscoveryStatus(organizationId, payload.discoveryId, 'new');
      throw error;
    }
  }

  async runEmbedding(job: PipelineJob<GenerateEmbeddingJobPayload>): Promise<void> {
    const { jobRunId, organizationId, payload } = job;
    await this.markRunning(jobRunId, 30);
    const dimensions = await this.embedDiscovery(organizationId, payload.discoveryId, payload.userId);
    await this.markCompleted(jobRunId, { discoveryId: payload.discoveryId, dimensions });
  }

  private async embedDiscovery(organizationId: string, discoveryId: string, userId: string): Promise<number> {
    const discovery = await this.loadDiscovery(organizationId, discoveryId);
    const text = [discovery.title, discovery.description, discovery.company_name, discovery.country]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join('\n');

    if (!text) {
      throw new Error(`Discovery ${discoveryId} has no embeddable text`);
    }

    const ai = await this.pool.buildService({ organizationId });
    const result = await ai.embed({ taskType: 'embedding', organizationId, userId }, { input: text });

    const { error } = await this.supabase
      .from('discoveries')
      .update({ embedding: toVectorLiteral(result.vector) as unknown as number[] })
      .eq('id', discoveryId)
      .eq('organization_id', organizationId);

    if (error) {
      throw new Error(`Failed to store embedding for ${discoveryId}: ${error.message}`);
    }
    return result.vector.length;
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

  private async setDiscoveryStatus(
    organizationId: string,
    discoveryId: string,
    status: DiscoveryStatus,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('discoveries')
      .update({ status })
      .eq('id', discoveryId)
      .eq('organization_id', organizationId);

    if (error) {
      throw new Error(`Failed to set discovery ${discoveryId} status to ${status}: ${error.message}`);
    }
  }

  private async markRunning(jobRunId: string, progress: number): Promise<void> {
    await this.updateJobRun(jobRunId, {
      status: 'running',
      started_at: new Date().toISOString(),
      progress,
      error: null,
    });
  }

  private async markCompleted(jobRunId: string, result: Json): Promise<void> {
    await this.updateJobRun(jobRunId, {
      status: 'completed',
      progress: 100,
      finished_at: new Date().toISOString(),
      result,
    });
  }

  private async updateJobRun(
    jobRunId: string,
    patch: Database['public']['Tables']['job_runs']['Update'],
  ): Promise<void> {
    const { error } = await this.supabase.from('job_runs').update(patch).eq('id', jobRunId);
    if (error) {
      throw new Error(`Failed to update job_run ${jobRunId}: ${error.message}`);
    }
  }
}
