import type { ExtensionBatchPayload } from './types';

interface SendBatchOptions {
  apiBaseUrl: string;
  captureToken: string;
  idempotencyKey: string;
  payload: ExtensionBatchPayload;
}

export interface SendBatchAccepted {
  batchId: string;
  jobId: string;
}

export async function sendBatch(options: SendBatchOptions): Promise<SendBatchAccepted> {
  const res = await fetch(`${options.apiBaseUrl.replace(/\/+$/, '')}/api/v1/ingest/extension`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.captureToken}`,
      'Idempotency-Key': options.idempotencyKey,
    },
    body: JSON.stringify(options.payload),
  });

  const body = (await res.json().catch(() => undefined)) as { title?: string; batchId?: string; jobId?: string } | undefined;
  if (!res.ok || !body?.batchId || !body?.jobId) {
    throw new Error(body?.title ?? `Extension ingestion failed (${res.status})`);
  }

  return { batchId: body.batchId, jobId: body.jobId };
}
