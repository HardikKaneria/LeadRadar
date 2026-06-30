import { Injectable, Inject, Logger, type OnModuleInit } from '@nestjs/common';
import { QUEUES } from '@radar/contracts';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type { ServiceClient } from '@radar/supabase';
import { SupabaseQueueService, type Job } from '../../queue/supabase-queue.service';

import { processDemo } from './processors/demo.processor';
import { processManualIngestion } from './processors/ingest-manual.processor';
import { processCsvImport } from './processors/import-csv.processor';
import { processExtensionBatch } from './processors/process-extension-batch.processor';
import { processRecomputeScoring } from './processors/recompute-scoring.processor';
import {
  createAnalysisEnqueuer,
  createLeadHuntingResearchEnqueuer,
} from './processors/pipeline-producer';
import { ExternalProviderIntelligenceService } from '../lead-hunting/external-provider-intelligence.service';
import { LeadHuntingResearchService } from '../lead-hunting/lead-hunting-research.service';
import { detectStaleLeads } from './processors/detect-stale-leads';
import { generateWeeklyInsight } from './processors/generate-weekly-insight';
import { buildDigest } from './processors/build-digest';
import { recomputeHeat } from './processors/recompute-heat.processor';
import { resurrectLeads } from './processors/resurrect-leads';

@Injectable()
export class WorkerProcessorService implements OnModuleInit {
  private readonly logger = new Logger(WorkerProcessorService.name);

  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly queueService: SupabaseQueueService,
    private readonly leadHuntingResearch: LeadHuntingResearchService,
    private readonly externalProviderIntelligence: ExternalProviderIntelligenceService,
  ) {}

  onModuleInit() {
    const enqueueAnalysis = createAnalysisEnqueuer(this.queueService);
    const enqueueLeadHuntingResearch = createLeadHuntingResearchEnqueuer(this.queueService);

    this.queueService.startPolling(QUEUES.demo, async (job: Job) => {
      this.logger.log(`Processing demo job ${job.id}`);
      await processDemo(job as any, this.supabase);
    });

    this.queueService.startPolling(QUEUES.ingestManual, async (job: Job) => {
      this.logger.log(`Processing ingestManual job ${job.id}`);
      await processManualIngestion(job as any, this.supabase, enqueueAnalysis);
    });

    this.queueService.startPolling(QUEUES.importCsv, async (job: Job) => {
      this.logger.log(`Processing importCsv job ${job.id}`);
      await processCsvImport(job as any, this.supabase, enqueueAnalysis);
    });

    this.queueService.startPolling(QUEUES.processExtensionBatch, async (job: Job) => {
      this.logger.log(`Processing processExtensionBatch job ${job.id}`);
      await processExtensionBatch(job as any, this.supabase, enqueueLeadHuntingResearch);
    });

    this.queueService.startPolling(QUEUES.researchRawPost, async (job: Job) => {
      this.logger.log(`Processing researchRawPost job ${job.id}`);
      await this.leadHuntingResearch.runQueuedResearch({
        jobRunId: job.id,
        organizationId: job.organization_id,
        payload: job.payload as any,
      });
    });

    this.queueService.startPolling(QUEUES.recomputeScoring, async (job: Job) => {
      this.logger.log(`Processing recomputeScoring job ${job.id}`);
      await processRecomputeScoring(job, this.supabase);
    });

    setInterval(() => {
      this.logger.log('Running external-provider-reset-check');
      this.externalProviderIntelligence.runResetCheck().catch((err) =>
        this.logger.error('Failed to run external-provider-reset-check', err),
      );
    }, 60 * 60 * 1000);

    setInterval(() => {
      this.logger.log('Running sync-external-provider-usage');
      this.externalProviderIntelligence.syncUsage().catch((err) =>
        this.logger.error('Failed to run sync-external-provider-usage', err),
      );
    }, 6 * 60 * 60 * 1000);

    // Run stale-lead detection periodically (every 5 minutes)
    setInterval(() => {
      this.logger.log('Running periodic detectStaleLeads');
      detectStaleLeads(this.supabase).catch((err) => 
        this.logger.error('Failed to run detectStaleLeads', err)
      );
    }, 5 * 60 * 1000);

    this.queueService.startPolling(QUEUES.generateWeeklyInsight, async (job: Job) => {
      this.logger.log(`Processing generateWeeklyInsight job ${job.id}`);
      await generateWeeklyInsight(job, this.supabase);
    });

    this.queueService.startPolling(QUEUES.buildDigest, async (job: Job) => {
      this.logger.log(`Processing buildDigest job ${job.id}`);
      await buildDigest(job, this.supabase);
    });

    this.queueService.startPolling(QUEUES.recomputeHeat, async (job: Job) => {
      this.logger.log(`Processing recomputeHeat job ${job.id}`);
      await recomputeHeat(job, this.supabase);
    });

    // Check once an hour if it's Monday and we haven't enqueued insights yet today
    setInterval(async () => {
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 1) { // 1 = Monday
        this.logger.log('Checking if weekly insights should be generated today...');
        try {
          // Find all orgs
          const { data: orgs } = await this.supabase.from('organizations').select('id');
          if (!orgs) return;

          for (const org of orgs) {
            // Check if job exists in last 24h
            const { data: recentJobs } = await this.supabase
              .from('job_runs')
              .select('id')
              .eq('queue_name', QUEUES.generateWeeklyInsight)
              .eq('organization_id', org.id)
              .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
              .limit(1);

            if (!recentJobs || recentJobs.length === 0) {
              await this.queueService.enqueue(
                org.id,
                QUEUES.generateWeeklyInsight,
                'Weekly Insight Digest',
                { organizationId: org.id }
              );
            }
          }
        } catch (err) {
          this.logger.error('Failed to enqueue weekly insights', err);
        }
      }
    }, 60 * 60 * 1000); // Check every hour

    // Heat recompute: runs at 2am UTC daily — recalculates heat + expires_at for all open opps.
    setInterval(async () => {
      const now = new Date();
      if (now.getUTCHours() !== 2) return;
      try {
        const { data: orgs } = await this.supabase.from('organizations').select('id');
        if (!orgs) return;
        const todayStart = new Date(now);
        todayStart.setUTCHours(0, 0, 0, 0);
        for (const org of orgs) {
          const { data: recent } = await this.supabase
            .from('job_runs')
            .select('id')
            .eq('queue_name', QUEUES.recomputeHeat)
            .eq('organization_id', org.id)
            .gte('created_at', todayStart.toISOString())
            .limit(1);
          if (!recent || recent.length === 0) {
            await this.queueService.enqueue(org.id, QUEUES.recomputeHeat, 'Recompute Heat', { organizationId: org.id });
          }
        }
      } catch (err) {
        this.logger.error('Failed to enqueue heat recompute', err);
      }
    }, 60 * 60 * 1000);

    // Daily digest: check once an hour whether it's 8am UTC and digest hasn't been sent today.
    setInterval(async () => {
      const now = new Date();
      if (now.getUTCHours() !== 8) return;
      try {
        const { data: orgs } = await this.supabase.from('organizations').select('id');
        if (!orgs) return;
        for (const org of orgs) {
          const todayStart = new Date();
          todayStart.setUTCHours(0, 0, 0, 0);
          const { data: recent } = await this.supabase
            .from('job_runs')
            .select('id')
            .eq('queue_name', QUEUES.buildDigest)
            .eq('organization_id', org.id)
            .gte('created_at', todayStart.toISOString())
            .limit(1);
          if (!recent || recent.length === 0) {
            await this.queueService.enqueue(org.id, QUEUES.buildDigest, 'Daily Digest', { organizationId: org.id });
          }
        }
      } catch (err) {
        this.logger.error('Failed to enqueue daily digests', err);
      }
    }, 60 * 60 * 1000);

    this.queueService.startPolling(QUEUES.resurrectLeads, async (job: Job) => {
      this.logger.log(`Processing resurrectLeads job ${job.id}`);
      await resurrectLeads(job, this.supabase);
    });

    // Lead resurrection: check once an hour whether it's 9am UTC and it hasn't been sent today.
    setInterval(async () => {
      const now = new Date();
      if (now.getUTCHours() !== 9) return;
      try {
        const { data: orgs } = await this.supabase.from('organizations').select('id');
        if (!orgs) return;
        for (const org of orgs) {
          const todayStart = new Date();
          todayStart.setUTCHours(0, 0, 0, 0);
          const { data: recent } = await this.supabase
            .from('job_runs')
            .select('id')
            .eq('queue_name', QUEUES.resurrectLeads)
            .eq('organization_id', org.id)
            .gte('created_at', todayStart.toISOString())
            .limit(1);
          if (!recent || recent.length === 0) {
            await this.queueService.enqueue(org.id, QUEUES.resurrectLeads, 'Lead Resurrection', { organizationId: org.id });
          }
        }
      } catch (err) {
        this.logger.error('Failed to enqueue lead resurrection', err);
      }
    }, 60 * 60 * 1000);
  }
}
