import {
  QUEUES,
  type AnalyzeDiscoveryJobPayload,
  type LeadHuntingResearchJobPayload,
} from '@radar/contracts';
import type { SupabaseQueueService } from '../../../queue/supabase-queue.service';

export type EnqueueAnalysis = (
  organizationId: string,
  discoveryId: string,
  userId: string,
) => Promise<void>;

export type EnqueueLeadHuntingResearch = (
  organizationId: string,
  rawPostId: string,
  postResearchJobId: string,
  searchSessionId: string,
  capturedBy: string | null,
  force?: boolean,
  requestedBy?: string | null,
) => Promise<string>;

/** Builds the producer that creates a tracked `analyze-discovery` job_run and enqueues it. */
export function createAnalysisEnqueuer(queueService: SupabaseQueueService): EnqueueAnalysis {
  return async (organizationId, discoveryId, userId) => {
    const payload: AnalyzeDiscoveryJobPayload = { discoveryId, userId };
    await queueService.enqueue(
      organizationId,
      QUEUES.analyzeDiscovery,
      'analyze-discovery',
      payload,
      'discovery',
      discoveryId,
    );
  };
}

export function createLeadHuntingResearchEnqueuer(
  queueService: SupabaseQueueService,
): EnqueueLeadHuntingResearch {
  return async (
    organizationId,
    rawPostId,
    postResearchJobId,
    searchSessionId,
    capturedBy,
    force = false,
    requestedBy = null,
  ) => {
    const payload: LeadHuntingResearchJobPayload = {
      rawPostId,
      postResearchJobId,
      searchSessionId,
      capturedBy,
      force,
      requestedBy,
    };
    return queueService.enqueue(
      organizationId,
      QUEUES.researchRawPost,
      'research-raw-post',
      payload,
      'raw_post',
      rawPostId,
    );
  };
}

/**
 * Best-effort auto-analysis trigger for freshly inserted discoveries. Never throws: analysis can
 * always be re-triggered via `POST /discoveries/:id/analyze`, so a producer hiccup must not fail
 * an otherwise successful ingestion job.
 */
export async function enqueueAnalysisForDiscoveries(
  enqueue: EnqueueAnalysis,
  organizationId: string,
  discoveryIds: string[],
  userId: string,
): Promise<void> {
  for (const discoveryId of discoveryIds) {
    try {
      await enqueue(organizationId, discoveryId, userId);
    } catch {
      // swallow — ingestion already succeeded; analysis is recoverable.
    }
  }
}

/** Default no-op used when a processor is invoked without a producer (e.g. unit tests). */
export const noopEnqueueAnalysis: EnqueueAnalysis = async () => {};
export const noopEnqueueLeadHuntingResearch: EnqueueLeadHuntingResearch = async () => 'noop';
