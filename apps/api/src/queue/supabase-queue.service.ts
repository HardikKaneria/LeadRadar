import { Injectable, Inject, OnModuleDestroy, Logger } from '@nestjs/common';
import { SUPABASE_SERVICE } from '../supabase/supabase.module';
import { ServiceClient } from '@radar/supabase';

export interface Job {
  id: string;
  payload: any;
  organization_id: string;
  queue_name: string;
  job_name: string;
  attempts: number;
}

@Injectable()
export class SupabaseQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(SupabaseQueueService.name);
  private intervals: NodeJS.Timeout[] = [];
  private activeJobs = new Set<string>();

  constructor(
    @Inject(SUPABASE_SERVICE)
    private readonly supabase: ServiceClient,
  ) {}

  async enqueue(
    orgId: string,
    queueName: string,
    jobName: string,
    payload: any,
    entityType?: string,
    entityId?: string,
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('job_runs')
      .insert({
        organization_id: orgId,
        queue_name: queueName,
        job_name: jobName,
        payload,
        entity_type: entityType,
        entity_id: entityId,
        status: 'queued',
      })
      .select('id')
      .single();

    if (error) {
      this.logger.error(`Failed to enqueue job ${jobName} in ${queueName}: ${error.message}`);
      throw error;
    }

    return data.id;
  }

  startPolling(
    queueName: string,
    handler: (job: Job) => Promise<void>,
    options: { intervalMs?: number } = {},
  ) {
    const intervalMs = options.intervalMs ?? 2000;
    this.logger.log(`Starting polling for queue ${queueName} every ${intervalMs}ms`);

    const interval = setInterval(async () => {
      try {
        const { data, error } = await this.supabase.rpc('claim_next_job', {
          p_queue_name: queueName,
        });

        if (error) {
          this.logger.error(`Error claiming job for ${queueName}: ${error.message}`);
          return;
        }

        if (data && data.length > 0) {
          const jobData = data[0];
          const job: Job = {
            id: jobData.id,
            payload: jobData.payload,
            organization_id: jobData.organization_id,
            queue_name: jobData.queue_name,
            job_name: jobData.job_name,
            attempts: jobData.attempts,
          };
          this.activeJobs.add(job.id);
          this.logger.debug(`Claimed job ${job.id} from ${queueName}`);

          try {
            await handler(job);
            
            // Success
            await this.supabase
              .from('job_runs')
              .update({
                status: 'completed',
                finished_at: new Date().toISOString(),
              })
              .eq('id', job.id);
              
            this.logger.debug(`Job ${job.id} completed successfully`);
          } catch (handlerError: any) {
            this.logger.error(`Job ${job.id} failed: ${handlerError.message}`, handlerError.stack);
            
            // Failure logic
            const maxAttempts = jobData.max_attempts ?? 3;
            if (job.attempts < maxAttempts) {
              await this.supabase
                .from('job_runs')
                .update({
                  status: 'queued', // Retry
                  error: handlerError.message,
                })
                .eq('id', job.id);
            } else {
              await this.supabase
                .from('job_runs')
                .update({
                  status: 'failed',
                  error: handlerError.message,
                  finished_at: new Date().toISOString(),
                })
                .eq('id', job.id);
            }
          } finally {
            this.activeJobs.delete(job.id);
          }
        }
      } catch (e: any) {
        this.logger.error(`Unhandled error in queue poller for ${queueName}: ${e.message}`);
      }
    }, intervalMs);

    this.intervals.push(interval);
  }

  stopPolling() {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
    this.logger.log('Stopped all queue polling');
  }

  async onModuleDestroy() {
    this.stopPolling();
    
    // Wait briefly for active jobs to complete
    if (this.activeJobs.size > 0) {
      this.logger.log(`Waiting for ${this.activeJobs.size} active jobs to complete...`);
      // A simple loop to wait for max 5 seconds
      for (let i = 0; i < 50; i++) {
        if (this.activeJobs.size === 0) break;
        await new Promise(r => setTimeout(r, 100));
      }
      if (this.activeJobs.size > 0) {
        this.logger.warn(`${this.activeJobs.size} jobs did not complete in time during shutdown`);
      }
    }
  }
}
