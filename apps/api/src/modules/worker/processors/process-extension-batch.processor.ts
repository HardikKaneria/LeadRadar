import type { Job } from '../../../queue/supabase-queue.service';
import type { ServiceClient } from '@radar/supabase';
import { markBatch, markJobRun } from './discovery-ingestion';
import {
  createLeadHuntingCaptureResult,
  getOrCreateLeadSearchSession,
  ingestCapturedRawPost,
  syncLeadSearchSessionTotals,
  updateLeadHuntingCaptureResult,
} from './lead-hunting-capture';
import {
  noopEnqueueLeadHuntingResearch,
  type EnqueueLeadHuntingResearch,
} from './pipeline-producer';

export async function processExtensionBatch(
  job: Job,
  supabase: ServiceClient,
  enqueueResearch: EnqueueLeadHuntingResearch = noopEnqueueLeadHuntingResearch,
): Promise<void> {
  const { id: jobRunId, organization_id: organizationId, payload } = job;
  let searchSessionId: string | null = null;

  await markJobRun(supabase, jobRunId, {
    status: 'running',
    started_at: new Date().toISOString(),
    progress: 10,
    error: null,
  });
  await markBatch(supabase, payload.batchId, {
    status: 'processing',
    item_count: payload.items.length,
    error: null,
  });

  try {
    const session = await getOrCreateLeadSearchSession(supabase, organizationId, payload);
    searchSessionId = session.id;
    const result = createLeadHuntingCaptureResult(payload.batchId, session.id);

    for (const [index, item] of payload.items.entries()) {
      const decision = await ingestCapturedRawPost({
        supabase,
        organizationId,
        searchSessionId: session.id,
        source: payload.source,
        capturedBy: payload.capturedBy,
        item,
        itemIndex: index + 1,
        batchPayload: payload,
        enqueueResearch: (rawPostId, postResearchJobId) =>
          enqueueResearch(
            organizationId,
            rawPostId,
            postResearchJobId,
            session.id,
            payload.capturedBy ?? null,
          ),
      });
      updateLeadHuntingCaptureResult(result, decision);

      if ((index + 1) % 5 === 0 || index === payload.items.length - 1) {
        const progress = Math.min(95, 10 + Math.round(((index + 1) / payload.items.length) * 85));
        await markJobRun(supabase, jobRunId, { progress });
      }
    }

    await syncLeadSearchSessionTotals(supabase, session.id, result);
    await markBatch(supabase, payload.batchId, {
      status: 'completed',
      item_count: result.totalRows,
      error: null,
    });
    await markJobRun(supabase, jobRunId, {
      status: 'completed',
      progress: 100,
      finished_at: new Date().toISOString(),
      result: result as unknown as Record<string, unknown>,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown extension ingestion failure';
    await markBatch(supabase, payload.batchId, { status: 'failed', error: message });

    if (searchSessionId) {
      await supabase.from('lead_search_sessions').update({ status: 'failed' }).eq('id', searchSessionId);
    }

    throw error;
  }
}
