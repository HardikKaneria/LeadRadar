import type { Job } from '../../../queue/supabase-queue.service';
import type { CsvImportJobPayload } from '@radar/contracts';
import type { ServiceClient } from '@radar/supabase';
import type { JobEnvelope } from './job-envelope';
import {
  addSkippedRow,
  buildCsvRecords,
  createIngestionResult,
  ingestCandidate,
  markBatch,
  markJobRun,
  normalizeCsvRecord,
  updateIngestionResult,
  waitForStorageObject,
} from './discovery-ingestion';
import { enqueueAnalysisForDiscoveries, noopEnqueueAnalysis, type EnqueueAnalysis } from './pipeline-producer';

export async function processCsvImport(
  job: Job,
  supabase: ServiceClient,
  enqueueAnalysis: EnqueueAnalysis = noopEnqueueAnalysis,
): Promise<void> {
  const { id: jobRunId, organization_id: organizationId, payload } = job;
  const rawBlobUrl = `supabase://${payload.bucket}/${payload.path}`;
  const result = createIngestionResult(payload.batchId, rawBlobUrl);

  await markJobRun(supabase, jobRunId, {
    status: 'running',
    started_at: new Date().toISOString(),
    progress: 5,
    error: null,
  });
  await markBatch(supabase, payload.batchId, { status: 'processing', item_count: 0, error: null });

  try {
    const csvText = await waitForStorageObject(supabase, payload.bucket, payload.path);
    await markJobRun(supabase, jobRunId, { progress: 20 });

    const records = buildCsvRecords(csvText, payload.hasHeader);
    if (records.length === 0) {
      result.warnings.push('CSV contained no data rows.');
      await markBatch(supabase, payload.batchId, { status: 'completed', item_count: 0, error: null });
      await markJobRun(supabase, jobRunId, {
        status: 'completed',
        progress: 100,
        finished_at: new Date().toISOString(),
        result,
      });
      return;
    }

    for (const [index, record] of records.entries()) {
      const normalized = normalizeCsvRecord(record, payload.defaultSource, payload.fileName);
      if ('warning' in normalized) {
        addSkippedRow(result, normalized.warning);
      } else {
        const decision = await ingestCandidate(
          supabase,
          organizationId,
          payload.batchId,
          payload.uploadedBy,
          normalized.candidate,
        );
        updateIngestionResult(result, decision.decision, decision.discovery_id);
      }

      if ((index + 1) % 10 === 0 || index === records.length - 1) {
        const progress = Math.min(95, 20 + Math.round(((index + 1) / records.length) * 75));
        await markJobRun(supabase, jobRunId, { progress });
      }
    }

    await markBatch(supabase, payload.batchId, {
      status: 'completed',
      item_count: result.totalRows,
      error: null,
    });
    await enqueueAnalysisForDiscoveries(enqueueAnalysis, organizationId, result.discoveryIds, payload.uploadedBy);
    await markJobRun(supabase, jobRunId, {
      status: 'completed',
      progress: 100,
      finished_at: new Date().toISOString(),
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CSV import failure';
    await markBatch(supabase, payload.batchId, { status: 'failed', error: message });
    throw error;
  }
}
