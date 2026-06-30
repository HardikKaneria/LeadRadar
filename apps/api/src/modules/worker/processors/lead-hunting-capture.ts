import { createHash } from 'node:crypto';
import type { JobStatus } from '@radar/contracts';
import type { ExtensionBatchJobPayload, ExtensionCaptureItemInput } from '@radar/contracts';
import type { Json, ServiceClient } from '@radar/supabase';

type RawPostFingerprintType =
  | 'post_url'
  | 'post_text_hash'
  | 'owner_profile_text'
  | 'owner_name_date_excerpt'
  | 'company_text';

interface RawPostFingerprint {
  type: RawPostFingerprintType;
  hash: string;
}

interface NormalizedRawPostCapture {
  postUrl: string | null;
  postText: string | null;
  postTextHash: string | null;
  postOwnerName: string | null;
  postOwnerHeadline: string | null;
  postOwnerProfileUrl: string | null;
  visibleCompanyName: string | null;
  visibleCompanyUrl: string | null;
  postDate: string | null;
  reactionCount: number | null;
  commentCount: number | null;
  repostCount: number | null;
  mediaText: string | null;
  dedupHash: string;
  fingerprints: RawPostFingerprint[];
  rawPayload: Json;
}

export interface LeadHuntingCaptureResult {
  batchId: string;
  searchSessionId: string;
  totalRows: number;
  uniquePosts: number;
  duplicatePosts: number;
  queuedResearchJobs: number;
  rawPostIds: string[];
  warnings: string[];
}

export interface SearchSessionRecord {
  id: string;
  organization_id: string;
}

export interface CaptureDecision {
  rawPostId: string;
  wasDuplicate: boolean;
  queuedResearch: boolean;
  postResearchJobId: string | null;
}

interface PostResearchJobState {
  id: string;
  status: JobStatus;
  job_run_id: string | null;
}

const ACTIVE_RESEARCH_JOB_STATUSES = new Set<JobStatus>(['queued', 'running', 'retrying', 'completed']);

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const candidate = normalized.match(/^[a-z]+:\/\//i) ? normalized : `https://${normalized}`;
  try {
    const url = new URL(candidate);
    url.hash = '';
    url.search = '';
    const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return `https://${url.hostname.toLowerCase()}${pathname}`;
  } catch {
    return normalized.toLowerCase();
  }
}

function normalizeDay(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;
}

function normalizeCount(value: number | null | undefined): number | null {
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) ? value : null;
}

function canonicalText(value: string | null | undefined): string {
  return normalizeText(value)?.toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function excerpt(value: string, maxLength = 120): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function buildRawPayload(
  payload: ExtensionBatchJobPayload,
  item: ExtensionCaptureItemInput,
  itemIndex: number,
): Json {
  return toJson({
    discoveryBatchId: payload.batchId,
    source: payload.source,
    capturedUrl: payload.capturedUrl,
    capturedAt: payload.capturedAt,
    captureMode: payload.captureMode,
    searchQuery: payload.searchQuery ?? null,
    parserVersion: payload.parserVersion,
    itemIndex,
    extracted: item,
    raw: item.raw,
  });
}

export function normalizeRawPostCapture(
  payload: ExtensionBatchJobPayload,
  item: ExtensionCaptureItemInput,
  itemIndex: number,
): NormalizedRawPostCapture {
  const postUrl = normalizeUrl(item.postUrl ?? item.url);
  const postText = normalizeText(item.postText ?? item.description ?? item.title);
  const mediaText = normalizeText(item.mediaText);
  const postOwnerProfileUrl = normalizeUrl(item.postOwnerProfileUrl);
  const postOwnerName = normalizeText(item.postOwnerName ?? item.contactName);
  const visibleCompanyName = normalizeText(item.visibleCompanyName ?? item.companyName);
  const visibleCompanyUrl = normalizeUrl(item.visibleCompanyUrl ?? item.website);
  const postDate = normalizeDay(item.postDate);
  const baseText = canonicalText(postText ?? mediaText ?? item.description ?? item.title);
  const fingerprints: RawPostFingerprint[] = [];

  if (postUrl) {
    fingerprints.push({ type: 'post_url', hash: digest(postUrl) });
  }
  if (baseText) {
    fingerprints.push({ type: 'post_text_hash', hash: digest(baseText) });
  }
  if (postOwnerProfileUrl && baseText) {
    fingerprints.push({
      type: 'owner_profile_text',
      hash: digest(`${postOwnerProfileUrl}|${baseText}`),
    });
  }
  if (postOwnerName && (postDate || baseText)) {
    fingerprints.push({
      type: 'owner_name_date_excerpt',
      hash: digest(`${canonicalText(postOwnerName)}|${postDate ?? ''}|${excerpt(baseText)}`),
    });
  }
  if (visibleCompanyName && baseText) {
    fingerprints.push({
      type: 'company_text',
      hash: digest(`${canonicalText(visibleCompanyName)}|${excerpt(baseText)}`),
    });
  }

  const dedupHash = fingerprints[0]?.hash ?? digest(JSON.stringify(item));

  return {
    postUrl,
    postText,
    postTextHash: baseText ? digest(baseText) : null,
    postOwnerName,
    postOwnerHeadline: normalizeText(item.postOwnerHeadline),
    postOwnerProfileUrl,
    visibleCompanyName,
    visibleCompanyUrl,
    postDate,
    reactionCount: normalizeCount(item.reactionCount),
    commentCount: normalizeCount(item.commentCount),
    repostCount: normalizeCount(item.repostCount),
    mediaText,
    dedupHash,
    fingerprints,
    rawPayload: buildRawPayload(payload, item, itemIndex),
  };
}

export function createLeadHuntingCaptureResult(
  batchId: string,
  searchSessionId: string,
): LeadHuntingCaptureResult {
  return {
    batchId,
    searchSessionId,
    totalRows: 0,
    uniquePosts: 0,
    duplicatePosts: 0,
    queuedResearchJobs: 0,
    rawPostIds: [],
    warnings: [],
  };
}

export function updateLeadHuntingCaptureResult(
  result: LeadHuntingCaptureResult,
  decision: CaptureDecision,
): void {
  result.totalRows += 1;
  result.rawPostIds.push(decision.rawPostId);

  if (decision.wasDuplicate) {
    result.duplicatePosts += 1;
  } else {
    result.uniquePosts += 1;
  }

  if (decision.queuedResearch) {
    result.queuedResearchJobs += 1;
  }
}

export async function getOrCreateLeadSearchSession(
  supabase: ServiceClient,
  organizationId: string,
  payload: ExtensionBatchJobPayload,
): Promise<SearchSessionRecord> {
  const { data: existing, error: existingError } = await supabase
    .from('lead_search_sessions')
    .select('id, organization_id')
    .eq('organization_id', organizationId)
    .contains('raw_payload', { discoveryBatchId: payload.batchId })
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check lead search session: ${existingError.message}`);
  }
  if (existing) return existing;

  const { data, error } = await supabase
    .from('lead_search_sessions')
    .insert({
      organization_id: organizationId,
      source_platform: payload.source,
      search_query: payload.searchQuery ?? null,
      search_url: payload.capturedUrl,
      captured_by_user_id: payload.capturedBy,
      capture_mode: payload.captureMode,
      status: 'captured',
      parser_version: payload.parserVersion,
      total_posts_captured: payload.items.length,
      raw_payload: {
        discoveryBatchId: payload.batchId,
        source: payload.source,
        capturedUrl: payload.capturedUrl,
        capturedAt: payload.capturedAt,
        captureMode: payload.captureMode,
        searchQuery: payload.searchQuery ?? null,
        parserVersion: payload.parserVersion,
        tokenId: payload.tokenId,
        itemCount: payload.items.length,
      } satisfies Json,
    })
    .select('id, organization_id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create lead search session: ${error?.message ?? 'unknown error'}`);
  }

  return data;
}

async function findRawPostByFingerprint(
  supabase: ServiceClient,
  organizationId: string,
  fingerprint: RawPostFingerprint,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('raw_post_fingerprints')
    .select('raw_post_id')
    .eq('organization_id', organizationId)
    .eq('fingerprint_type', fingerprint.type)
    .eq('fingerprint_hash', fingerprint.hash)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up raw-post fingerprint: ${error.message}`);
  }

  return data?.raw_post_id ?? null;
}

async function findRawPostByDedupHash(
  supabase: ServiceClient,
  organizationId: string,
  dedupHash: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('raw_posts')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('dedup_hash', dedupHash)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to look up raw post by dedup hash: ${error.message}`);
  }

  return data?.id ?? null;
}

async function createRawPost(
  supabase: ServiceClient,
  organizationId: string,
  searchSessionId: string,
  capturedBy: string | null,
  source: ExtensionBatchJobPayload['source'],
  normalized: NormalizedRawPostCapture,
): Promise<{ rawPostId: string; inserted: boolean }> {
  const payload = {
    organization_id: organizationId,
    search_session_id: searchSessionId,
    source_platform: source,
    post_url: normalized.postUrl,
    post_text: normalized.postText,
    post_text_hash: normalized.postTextHash,
    post_owner_name: normalized.postOwnerName,
    post_owner_headline: normalized.postOwnerHeadline,
    post_owner_profile_url: normalized.postOwnerProfileUrl,
    visible_company_name: normalized.visibleCompanyName,
    visible_company_url: normalized.visibleCompanyUrl,
    post_date: normalized.postDate,
    reaction_count: normalized.reactionCount,
    comment_count: normalized.commentCount,
    repost_count: normalized.repostCount,
    media_text: normalized.mediaText,
    dedup_hash: normalized.dedupHash,
    raw_payload: normalized.rawPayload,
    status: 'raw_captured',
    captured_by_user_id: capturedBy,
  };

  const { data, error } = await supabase.from('raw_posts').insert(payload).select('id').single();

  if (!error && data) {
    return { rawPostId: data.id, inserted: true };
  }

  const duplicateCode = (error as { code?: string } | null)?.code;
  if (duplicateCode !== '23505') {
    throw new Error(`Failed to create raw post: ${error?.message ?? 'unknown error'}`);
  }

  const existingId = await findRawPostByDedupHash(supabase, organizationId, normalized.dedupHash);
  if (!existingId) {
    throw new Error(`Raw post insert conflicted but no canonical row was found for ${normalized.dedupHash}`);
  }

  return { rawPostId: existingId, inserted: false };
}

async function attachSessionPost(
  supabase: ServiceClient,
  organizationId: string,
  searchSessionId: string,
  rawPostId: string,
  captureIndex: number,
  wasDuplicate: boolean,
): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from('lead_search_session_posts')
    .select('id')
    .eq('search_session_id', searchSessionId)
    .eq('raw_post_id', rawPostId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to check session/raw-post link: ${lookupError.message}`);
  }

  if (existing) return;

  const { error } = await supabase.from('lead_search_session_posts').insert({
    organization_id: organizationId,
    search_session_id: searchSessionId,
    raw_post_id: rawPostId,
    capture_index: captureIndex,
    was_duplicate: wasDuplicate,
  });

  if (error) {
    throw new Error(`Failed to attach raw post to search session: ${error.message}`);
  }
}

async function storeFingerprints(
  supabase: ServiceClient,
  organizationId: string,
  rawPostId: string,
  fingerprints: RawPostFingerprint[],
): Promise<void> {
  if (fingerprints.length === 0) return;

  const { error } = await supabase.from('raw_post_fingerprints').upsert(
    fingerprints.map((fingerprint) => ({
      organization_id: organizationId,
      raw_post_id: rawPostId,
      fingerprint_type: fingerprint.type,
      fingerprint_hash: fingerprint.hash,
    })),
    { onConflict: 'organization_id,fingerprint_type,fingerprint_hash', ignoreDuplicates: true },
  );

  if (error) {
    throw new Error(`Failed to persist raw-post fingerprints: ${error.message}`);
  }
}

async function getPostResearchJob(
  supabase: ServiceClient,
  organizationId: string,
  rawPostId: string,
): Promise<PostResearchJobState | null> {
  const { data, error } = await supabase
    .from('post_research_jobs')
    .select('id, status, job_run_id')
    .eq('organization_id', organizationId)
    .eq('raw_post_id', rawPostId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to load post research job: ${error.message}`);
  }

  return data?.[0] ?? null;
}

async function ensurePostResearchJob(
  supabase: ServiceClient,
  organizationId: string,
  rawPostId: string,
): Promise<{ job: PostResearchJobState; needsQueue: boolean }> {
  const existing = await getPostResearchJob(supabase, organizationId, rawPostId);
  if (!existing) {
    const { data, error } = await supabase
      .from('post_research_jobs')
      .insert({
        organization_id: organizationId,
        raw_post_id: rawPostId,
        current_stage: 'dedupe',
        status: 'queued',
        progress: 0,
      })
      .select('id, status, job_run_id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create post research job: ${error?.message ?? 'unknown error'}`);
    }

    return { job: data, needsQueue: true };
  }

  if (ACTIVE_RESEARCH_JOB_STATUSES.has(existing.status) && existing.job_run_id) {
    return { job: existing, needsQueue: false };
  }

  const { data, error } = await supabase
    .from('post_research_jobs')
    .update({
      status: 'queued',
      progress: 0,
      last_error: null,
      started_at: null,
      completed_at: null,
    })
    .eq('id', existing.id)
    .select('id, status, job_run_id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to reset post research job: ${error?.message ?? 'unknown error'}`);
  }

  return { job: data, needsQueue: true };
}

export async function syncLeadSearchSessionTotals(
  supabase: ServiceClient,
  searchSessionId: string,
  result: LeadHuntingCaptureResult,
): Promise<void> {
  const { error } = await supabase
    .from('lead_search_sessions')
    .update({
      total_posts_captured: result.totalRows,
      total_unique_posts: result.uniquePosts,
      total_duplicates: result.duplicatePosts,
      status: result.queuedResearchJobs > 0 ? 'queued_for_research' : 'captured',
    })
    .eq('id', searchSessionId);

  if (error) {
    throw new Error(`Failed to update lead search session totals: ${error.message}`);
  }
}

export async function ingestCapturedRawPost(params: {
  supabase: ServiceClient;
  organizationId: string;
  searchSessionId: string;
  source: ExtensionBatchJobPayload['source'];
  capturedBy: string | null;
  item: ExtensionCaptureItemInput;
  itemIndex: number;
  batchPayload: ExtensionBatchJobPayload;
  enqueueResearch: (rawPostId: string, postResearchJobId: string) => Promise<string>;
}): Promise<CaptureDecision> {
  const normalized = normalizeRawPostCapture(params.batchPayload, params.item, params.itemIndex);

  let canonicalRawPostId: string | null = null;
  for (const fingerprint of normalized.fingerprints) {
    canonicalRawPostId = await findRawPostByFingerprint(params.supabase, params.organizationId, fingerprint);
    if (canonicalRawPostId) break;
  }

  if (!canonicalRawPostId) {
    canonicalRawPostId = await findRawPostByDedupHash(
      params.supabase,
      params.organizationId,
      normalized.dedupHash,
    );
  }

  let inserted = false;
  if (!canonicalRawPostId) {
    const created = await createRawPost(
      params.supabase,
      params.organizationId,
      params.searchSessionId,
      params.capturedBy,
      params.source,
      normalized,
    );
    canonicalRawPostId = created.rawPostId;
    inserted = created.inserted;
  }

  await attachSessionPost(
    params.supabase,
    params.organizationId,
    params.searchSessionId,
    canonicalRawPostId,
    params.itemIndex,
    !inserted,
  );
  await storeFingerprints(params.supabase, params.organizationId, canonicalRawPostId, normalized.fingerprints);

  const { job, needsQueue } = await ensurePostResearchJob(
    params.supabase,
    params.organizationId,
    canonicalRawPostId,
  );

  let queuedResearch = false;
  if (needsQueue) {
    const jobRunId = await params.enqueueResearch(canonicalRawPostId, job.id);
    queuedResearch = jobRunId !== 'noop';

    const { error: jobError } = await params.supabase
      .from('post_research_jobs')
      .update({
        status: queuedResearch ? 'queued' : job.status,
        job_run_id: queuedResearch ? jobRunId : job.job_run_id,
      })
      .eq('id', job.id);

    if (jobError) {
      throw new Error(`Failed to link research queue job: ${jobError.message}`);
    }

    if (queuedResearch) {
      const { error: rawPostError } = await params.supabase
        .from('raw_posts')
        .update({ status: 'queued_for_research', failure_reason: null })
        .eq('id', canonicalRawPostId);

      if (rawPostError) {
        throw new Error(`Failed to mark raw post queued for research: ${rawPostError.message}`);
      }
    }
  }

  return {
    rawPostId: canonicalRawPostId,
    wasDuplicate: !inserted,
    queuedResearch,
    postResearchJobId: job.id,
  };
}
