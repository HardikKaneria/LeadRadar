import type { Job } from '../../../queue/supabase-queue.service';
import type { ManualIngestionJobPayload } from '@radar/contracts';
import type { ServiceClient } from '@radar/supabase';
import type { JobEnvelope } from './job-envelope';
import {
  createIngestionResult,
  ingestCandidate,
  markBatch,
  markJobRun,
  normalizeManualEntry,
  updateIngestionResult,
} from './discovery-ingestion';
import { enqueueAnalysisForDiscoveries, noopEnqueueAnalysis, type EnqueueAnalysis } from './pipeline-producer';

export async function processManualIngestion(
  job: Job,
  supabase: ServiceClient,
  enqueueAnalysis: EnqueueAnalysis = noopEnqueueAnalysis,
): Promise<void> {
  const { id: jobRunId, organization_id: organizationId, payload } = job;
  const candidate = normalizeManualEntry(payload.entry);
  const result = createIngestionResult(payload.batchId, null);

  await markJobRun(supabase, jobRunId, {
    status: 'running',
    started_at: new Date().toISOString(),
    progress: 15,
    error: null,
  });
  await markBatch(supabase, payload.batchId, { status: 'processing', item_count: 1, error: null });

  try {
    const decision = await ingestCandidate(
      supabase,
      organizationId,
      payload.batchId,
      payload.submittedBy,
      candidate,
    );
    updateIngestionResult(result, decision.decision, decision.discovery_id);

    await markBatch(supabase, payload.batchId, {
      status: 'completed',
      item_count: result.totalRows,
      error: null,
    });
    await enqueueAnalysisForDiscoveries(enqueueAnalysis, organizationId, result.discoveryIds, payload.submittedBy);
    await markJobRun(supabase, jobRunId, {
      status: 'completed',
      progress: 100,
      finished_at: new Date().toISOString(),
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown manual ingestion failure';
    await markBatch(supabase, payload.batchId, { status: 'failed', error: message });
    throw error;
  }
}
