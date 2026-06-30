import type { Job } from '../../../queue/supabase-queue.service';
import type { ServiceClient } from '@radar/supabase';
import type { JobEnvelope } from './job-envelope';

/**
 * Demo processor — proves the async pipeline end-to-end (P1-08).
 * Real processors (analyze-discovery, import-csv, …) arrive in later phases but follow
 * this exact job_runs lifecycle: queued → running → completed | failed.
 */
export async function processDemo(job: Job, supabase: ServiceClient): Promise<void> {
  const { id: jobRunId, payload } = job;

  await supabase
    .from('job_runs')
    .update({ status: 'running', started_at: new Date().toISOString(), progress: 10 })
    .eq('id', jobRunId);

  // Simulate work.
  await new Promise((r) => setTimeout(r, 250));

  await supabase
    .from('job_runs')
    .update({
      status: 'completed',
      progress: 100,
      finished_at: new Date().toISOString(),
      result: { echoed: job.payload },
    })
    .eq('id', jobRunId);
}
