import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError } from '@radar/core';
import type { JobAccepted } from '@radar/contracts';
import type { ServiceClient } from '@radar/supabase';
import { SupabaseQueueService } from '../../queue/supabase-queue.service';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

export interface JobFilters {
  queue?: string;
  status?: string;
  entityType?: string;
}

@Injectable()
export class JobsService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly queueService: SupabaseQueueService,
  ) {}

  /** Enqueue a job via SupabaseQueueService. */
  async enqueue(
    organizationId: string,
    queueName: string,
    jobName: string,
    payload: object = {},
    entity?: { type: string; id: string },
  ): Promise<JobAccepted> {
    const id = await this.queueService.enqueue(
      organizationId,
      queueName,
      jobName,
      payload,
      entity?.type,
      entity?.id
    );
    return { jobId: id };
  }

  async list(organizationId: string, filters: JobFilters) {
    let q = this.supabase
      .from('job_runs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (filters.queue) q = q.eq('queue_name', filters.queue);
    if (filters.status) q = q.eq('status', filters.status as never);
    if (filters.entityType) q = q.eq('entity_type', filters.entityType);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  }

  async get(organizationId: string, id: string) {
    const { data } = await this.supabase
      .from('job_runs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!data) throw new NotFoundError('Job');
    return data;
  }

  async logs(organizationId: string, id: string) {
    const run = await this.get(organizationId, id);
    const lines = [
      `[${run.created_at}] queued ${run.queue_name}/${run.job_name}`,
      run.started_at ? `[${run.started_at}] running (progress ${run.progress}%)` : null,
      run.finished_at ? `[${run.finished_at}] ${run.status}` : null,
      run.error ? `error: ${run.error}` : null,
    ].filter(Boolean);
    return { id: run.id, status: run.status, lines };
  }

  async cancel(organizationId: string, id: string) {
    const run = await this.get(organizationId, id);
    if (run.status !== 'queued' && run.status !== 'running' && run.status !== 'retrying') {
      throw new ConflictError(`Job in status "${run.status}" cannot be cancelled`);
    }
    const { data, error } = await this.supabase
      .from('job_runs')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async retry(organizationId: string, id: string) {
    const run = await this.get(organizationId, id);
    if (run.status !== 'failed') {
      throw new ConflictError(`Job in status "${run.status}" cannot be retried`);
    }
    const { data, error } = await this.supabase
      .from('job_runs')
      .update({ status: 'queued', attempts: 0, error: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}
