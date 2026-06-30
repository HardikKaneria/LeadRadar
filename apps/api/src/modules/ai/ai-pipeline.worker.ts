import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  QUEUES,
  type AnalyzeDiscoveryJobPayload,
  type GenerateEmbeddingJobPayload,
  type GenerateProposalJobPayload,
  type ResearchCompanyJobPayload,
} from '@radar/contracts';
import { SupabaseQueueService, type Job } from '../../queue/supabase-queue.service';
import { DiscoveryPipelineService, type PipelineJob } from './discovery-pipeline.service';
import { OpportunityAnalyzerService } from './opportunity-analyzer.service';
import { BillingService } from '../billing/billing.service';
import { Inject } from '@nestjs/common';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type { ServiceClient } from '@radar/supabase';

/**
 * Hosts the consumers for the AI pipeline inside the API process.
 * Backed by the Postgres job queue (SupabaseQueueService).
 */
@Injectable()
export class AiPipelineWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiPipelineWorker.name);

  constructor(
    private readonly queueService: SupabaseQueueService,
    private readonly pipeline: DiscoveryPipelineService,
    private readonly opportunityAnalyzer: OpportunityAnalyzerService,
    private readonly billingService: BillingService,
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
  ) {}

  onModuleInit(): void {
    // Start polling the 3 AI queues
    this.queueService.startPolling(QUEUES.analyzeDiscovery, async (job: Job) => {
      this.logger.log(`processing analyzeDiscovery/${job.id}`);
      
      // 1. Check AI Request Limit
      const { count } = await this.supabase
        .from('ai_requests')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', job.organization_id)
        .gte('created_at', new Date(new Date().setDate(1)).toISOString()); // Roughly this month
        
      const allowed = await this.billingService.checkUsageLimit(job.organization_id, 'ai_requests', count || 0);
      if (!allowed) {
        this.logger.warn(`AI request limit exceeded for org ${job.organization_id}`);
        throw new Error('USAGE_LIMIT_EXCEEDED');
      }

      const pipelineJob: PipelineJob<AnalyzeDiscoveryJobPayload> = {
        jobRunId: job.id,
        organizationId: job.organization_id,
        payload: job.payload,
      };
      await this.pipeline.runAnalyze(pipelineJob);
    });

    this.queueService.startPolling(QUEUES.generateEmbedding, async (job: Job) => {
      this.logger.log(`processing generateEmbedding/${job.id}`);
      const pipelineJob: PipelineJob<GenerateEmbeddingJobPayload> = {
        jobRunId: job.id,
        organizationId: job.organization_id,
        payload: job.payload,
      };
      await this.pipeline.runEmbedding(pipelineJob);
    });

    this.queueService.startPolling(QUEUES.researchCompany, async (job: Job) => {
      this.logger.log(`processing researchCompany/${job.id}`);
      const pipelineJob: PipelineJob<ResearchCompanyJobPayload> = {
        jobRunId: job.id,
        organizationId: job.organization_id,
        payload: job.payload,
      };
      await this.pipeline.runCompanyResearch(pipelineJob);
    });

    this.queueService.startPolling(QUEUES.generateProposal, async (job: Job) => {
      this.logger.log(`processing generateProposal/${job.id}`);
      const pipelineJob: PipelineJob<GenerateProposalJobPayload> = {
        jobRunId: job.id,
        organizationId: job.organization_id,
        payload: job.payload,
      };
      await this.pipeline.runGenerateProposal(pipelineJob);
    });

    this.queueService.startPolling(QUEUES.generateOpportunityEmbedding, async (job: Job) => {
      this.logger.log(`processing generateOpportunityEmbedding/${job.id}`);
      const payload = job.payload as { opportunityId: string; userId?: string };
      // userId is optional if we just use a system ID or omitted, but let's pass a placeholder if missing
      await this.opportunityAnalyzer.embedOpportunity(
        job.organization_id,
        payload.opportunityId,
        payload.userId ?? 'system'
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    // SupabaseQueueService handles its own shutdown
  }
}
