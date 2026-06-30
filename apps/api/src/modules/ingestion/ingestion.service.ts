import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  QUEUES,
  type CsvImportJobPayload,
  type CsvIngestionAccepted,
  type CsvIngestionInput,
  type CsvUploadTarget,
  type DiscoveryIngestionAccepted,
  type DiscoverySource,
  type ExtensionBatchIngestionInput,
  type ExtensionBatchJobPayload,
  type ManualDiscoveryInput,
  type ManualIngestionJobPayload,
} from '@radar/contracts';
import { type AppConfig, ValidationError } from '@radar/core';
import type { ServiceClient } from '@radar/supabase';
import { APP_CONFIG } from '../../config/app-config.module';
import { JobsService } from '../jobs/jobs.service';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { IdempotencyService } from './idempotency.service';
import { ExtensionService } from '../extension/extension.service';

@Injectable()
export class IngestionService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly jobs: JobsService,
    private readonly idempotency: IdempotencyService,
    private readonly extension: ExtensionService,
  ) {}

  async verifyExtensionToken(rawToken: string) {
    return this.extension.verifyCaptureToken(rawToken, 'discovery.capture');
  }

  async enqueueManual(
    organizationId: string,
    userId: string,
    idempotencyKey: string | undefined,
    input: ManualDiscoveryInput,
  ): Promise<DiscoveryIngestionAccepted> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.fingerprint(input);
    const scope = `ingest:manual:${organizationId}`;
    const reservation = await this.idempotency.reserve<DiscoveryIngestionAccepted>(scope, key, fingerprint);
    if (reservation.kind === 'replayed') return reservation.response;

    const batchId = randomUUID();
    try {
      await this.createBatch({
        batchId,
        organizationId,
        source: input.source,
        channel: 'manual',
        parserVersion: 'manual-v1',
        rawBlobUrl: null,
        itemCount: 1,
        capturedBy: userId,
      });

      const payload: ManualIngestionJobPayload = {
        batchId,
        submittedBy: userId,
        entry: input,
      };
      const job = await this.jobs.enqueue(
        organizationId,
        QUEUES.ingestManual,
        'manual-discovery',
        payload,
        { type: 'discovery_batch', id: batchId },
      );

      const response: DiscoveryIngestionAccepted = { jobId: job.jobId, batchId };
      await this.idempotency.complete(scope, key, fingerprint, response);
      return response;
    } catch (error) {
      await this.failBatch(batchId, error);
      await this.idempotency.clear(scope, key);
      throw error;
    }
  }

  async enqueueCsvImport(
    organizationId: string,
    userId: string,
    idempotencyKey: string | undefined,
    input: CsvIngestionInput,
  ): Promise<CsvIngestionAccepted> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const fingerprint = this.fingerprint(input);
    const scope = `ingest:csv:${organizationId}`;
    const reservation = await this.idempotency.reserve<CsvIngestionAccepted>(scope, key, fingerprint);
    if (reservation.kind === 'replayed') return reservation.response;

    const batchId = randomUUID();
    const path = `${organizationId}/${batchId}/${this.sanitizeFileName(input.fileName)}`;
    const rawBlobUrl = `supabase://${this.config.DISCOVERY_IMPORTS_BUCKET}/${path}`;

    try {
      await this.createBatch({
        batchId,
        organizationId,
        source: 'csv',
        channel: 'csv',
        parserVersion: 'csv-v1',
        rawBlobUrl,
        itemCount: 0,
        capturedBy: userId,
      });

      const { data, error } = await this.supabase.storage
        .from(this.config.DISCOVERY_IMPORTS_BUCKET)
        .createSignedUploadUrl(path);

      if (error || !data) {
        throw new Error(`Failed to create signed CSV upload URL: ${error?.message ?? 'unknown error'}`);
      }

      const payload: CsvImportJobPayload = {
        batchId,
        bucket: this.config.DISCOVERY_IMPORTS_BUCKET,
        path,
        fileName: input.fileName,
        hasHeader: input.hasHeader,
        defaultSource: input.defaultSource,
        uploadedBy: userId,
      };
      const job = await this.jobs.enqueue(
        organizationId,
        QUEUES.importCsv,
        'import-csv',
        payload,
        { type: 'discovery_batch', id: batchId },
      );

      const upload = data as { path: string; token: string; signedUrl?: string };
      const response: CsvIngestionAccepted = {
        jobId: job.jobId,
        batchId,
        upload: {
          bucket: this.config.DISCOVERY_IMPORTS_BUCKET,
          path: upload.path,
          token: upload.token,
          signedUrl: upload.signedUrl ?? null,
        } satisfies CsvUploadTarget,
      };
      await this.idempotency.complete(scope, key, fingerprint, response);
      return response;
    } catch (error) {
      await this.failBatch(batchId, error);
      await this.idempotency.clear(scope, key);
      throw error;
    }
  }

  async enqueueExtensionBatch(
    rawToken: string,
    idempotencyKey: string | undefined,
    input: ExtensionBatchIngestionInput,
  ): Promise<DiscoveryIngestionAccepted> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const context = await this.extension.verifyCaptureToken(rawToken, 'discovery.capture');
    const fingerprint = this.fingerprint(input);
    const scope = `ingest:extension:${context.organizationId}:${context.tokenId}`;
    const reservation = await this.idempotency.reserve<DiscoveryIngestionAccepted>(scope, key, fingerprint);
    if (reservation.kind === 'replayed') return reservation.response;

    const batchId = randomUUID();
    try {
      await this.createBatch({
        batchId,
        organizationId: context.organizationId,
        source: input.source,
        channel: 'extension',
        parserVersion: input.parserVersion,
        rawBlobUrl: null,
        itemCount: input.items.length,
        capturedBy: context.userId,
      });

      const payload: ExtensionBatchJobPayload = {
        batchId,
        source: input.source,
        capturedUrl: input.capturedUrl,
        capturedAt: input.capturedAt,
        captureMode: input.captureMode,
        searchQuery: input.searchQuery ?? undefined,
        parserVersion: input.parserVersion,
        tokenId: context.tokenId,
        capturedBy: context.userId,
        items: input.items,
      };
      const job = await this.jobs.enqueue(
        context.organizationId,
        QUEUES.processExtensionBatch,
        'process-extension-batch',
        payload,
        { type: 'discovery_batch', id: batchId },
      );

      const response: DiscoveryIngestionAccepted = { jobId: job.jobId, batchId };
      await this.idempotency.complete(scope, key, fingerprint, response);
      return response;
    } catch (error) {
      await this.failBatch(batchId, error);
      await this.idempotency.clear(scope, key);
      throw error;
    }
  }

  private requireIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) {
      throw new ValidationError('Missing Idempotency-Key header');
    }
    return key;
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private sanitizeFileName(value: string): string {
    const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');
    return cleaned.length > 0 ? cleaned : 'import.csv';
  }

  private async createBatch(params: {
    batchId: string;
    organizationId: string;
    source: DiscoverySource;
    channel: 'manual' | 'csv' | 'extension';
    parserVersion: string;
    rawBlobUrl: string | null;
    itemCount: number;
    capturedBy: string;
  }): Promise<void> {
    const { error } = await this.supabase.from('discovery_batches').insert({
      id: params.batchId,
      organization_id: params.organizationId,
      source: params.source,
      channel: params.channel,
      status: 'pending',
      parser_version: params.parserVersion,
      raw_blob_url: params.rawBlobUrl,
      item_count: params.itemCount,
      captured_by: params.capturedBy,
    });

    if (error) {
      throw new Error(`Failed to create discovery batch: ${error.message}`);
    }
  }

  private async failBatch(batchId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await this.supabase
      .from('discovery_batches')
      .update({ status: 'failed', error: message })
      .eq('id', batchId);
  }
}
