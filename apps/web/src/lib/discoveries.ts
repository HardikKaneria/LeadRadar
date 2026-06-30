
// Discovery Inbox data layer (P2-06). Direct supabase-js access under RLS:
// reads use the `discoveries.read` SELECT policy; status updates use `discoveries.write`
// (see supabase/migrations/0005/0006). All queries are org-scoped explicitly *and* by RLS.

import type {
  DiscoveryDetail,
  DiscoveryFilter,
  DiscoveryInboxStatus,
  DiscoveryListResult,
  JobStatus,
  Priority,
  DiscoverySummary,
  DiscoveryChannel,
} from '@radar/contracts';
import { supabase } from './supabase';

const SUMMARY_COLS = 'id, source, status, title, company_name, country, budget_hint, assigned_to_user_id, capture_channel, created_at';
const DETAIL_COLS =
  `${SUMMARY_COLS}, batch_id, description, contact_name, email, phone, website, dedup_hash, raw_payload, captured_by_user_id, reviewed_by_user_id, approved_by_user_id, updated_at`;
const ANALYSIS_COLS =
  'discovery_id, score, urgency, service_match, reason, recommended_action, is_bad_lead, created_at';
const ACTION_PLAN_COLS = 'discovery_id, priority, due_at, recommended_action, reason, created_at';
const ANALYSIS_JOB_COLS = 'id, entity_id, job_name, status, progress, error, created_at, finished_at';

export type DiscoveryAnalysisUrgency = 'urgent' | 'soon' | 'later' | 'none';

export interface DiscoveryServiceMatch {
  service: string;
  confidence: number;
  isPriority: boolean;
}

export interface DiscoveryAnalysisSummary {
  score: number;
  urgency: DiscoveryAnalysisUrgency;
  serviceMatches: DiscoveryServiceMatch[];
  reason: string | null;
  recommendedAction: string | null;
  isBadLead: boolean;
  createdAt: string;
}

export interface DiscoveryActionPlanSummary {
  priority: Priority;
  dueAt: string;
  recommendedAction: string;
  reason: string;
  createdAt: string;
}

export interface DiscoveryAnalysisJob {
  id: string;
  jobName: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface DiscoverySummaryWithAi extends DiscoverySummary {
  analysis: DiscoveryAnalysisSummary | null;
  actionPlan: DiscoveryActionPlanSummary | null;
  analysisJob: DiscoveryAnalysisJob | null;
}

export interface DiscoveryDetailWithAi extends DiscoveryDetail {
  analysis: DiscoveryAnalysisSummary | null;
  actionPlan: DiscoveryActionPlanSummary | null;
  analysisJob: DiscoveryAnalysisJob | null;
}

export interface DiscoveryListResultWithAi extends Omit<DiscoveryListResult, 'items'> {
  items: DiscoverySummaryWithAi[];
}

interface SummaryRow {
  id: string;
  source: DiscoverySummary['source'];
  status: DiscoverySummary['status'];
  title: string | null;
  company_name: string | null;
  country: string | null;
  budget_hint: number | null;
  assigned_to_user_id: string | null;
  capture_channel: DiscoveryChannel | null;
  created_at: string;
}

interface DetailRow extends SummaryRow {
  batch_id: string | null;
  description: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  dedup_hash: string | null;
  raw_payload: unknown;
  captured_by_user_id: string | null;
  reviewed_by_user_id: string | null;
  approved_by_user_id: string | null;
  updated_at: string;
}

interface AnalysisRow {
  discovery_id: string;
  score: number;
  urgency: DiscoveryAnalysisUrgency;
  service_match: unknown;
  reason: string | null;
  recommended_action: string | null;
  is_bad_lead: boolean;
  created_at: string;
}

interface ActionPlanRow {
  discovery_id: string;
  priority: Priority;
  due_at: string;
  recommended_action: string;
  reason: string;
  created_at: string;
}

interface AnalysisJobRow {
  id: string;
  entity_id: string | null;
  job_name: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asServiceMatches(value: unknown): DiscoveryServiceMatch[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): DiscoveryServiceMatch[] => {
    if (!isRecord(entry) || typeof entry.service !== 'string' || entry.service.trim().length === 0) {
      return [];
    }
    const confidence =
      typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
        ? Math.min(1, Math.max(0, entry.confidence))
        : 0;
    return [
      {
        service: entry.service.trim(),
        confidence,
        isPriority: entry.isPriority === true,
      },
    ];
  });
}

function toSummary(r: SummaryRow): DiscoverySummary {
  return {
    id: r.id,
    source: r.source,
    status: r.status,
    title: r.title,
    companyName: r.company_name,
    country: r.country,
    budgetHint: r.budget_hint,
    assignedToUserId: r.assigned_to_user_id,
    captureChannel: r.capture_channel,
    createdAt: r.created_at,
  };
}

function toAnalysis(r: AnalysisRow): DiscoveryAnalysisSummary {
  return {
    score: r.score,
    urgency: r.urgency,
    serviceMatches: asServiceMatches(r.service_match),
    reason: r.reason,
    recommendedAction: r.recommended_action,
    isBadLead: r.is_bad_lead,
    createdAt: r.created_at,
  };
}

function toActionPlan(r: ActionPlanRow): DiscoveryActionPlanSummary {
  return {
    priority: r.priority,
    dueAt: r.due_at,
    recommendedAction: r.recommended_action,
    reason: r.reason,
    createdAt: r.created_at,
  };
}

function toAnalysisJob(r: AnalysisJobRow): DiscoveryAnalysisJob {
  return {
    id: r.id,
    jobName: r.job_name,
    status: r.status,
    progress: r.progress,
    error: r.error,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  };
}

function toDetail(r: DetailRow): DiscoveryDetail {
  return {
    ...toSummary(r),
    batchId: r.batch_id,
    description: r.description,
    contactName: r.contact_name,
    email: r.email,
    phone: r.phone,
    website: r.website,
    dedupHash: r.dedup_hash,
    rawPayload: r.raw_payload,
    capturedByUserId: r.captured_by_user_id,
    reviewedByUserId: r.reviewed_by_user_id,
    approvedByUserId: r.approved_by_user_id,
    updatedAt: r.updated_at,
  };
}

async function loadLatestAnalyses(
  organizationId: string,
  discoveryIds: string[],
): Promise<Map<string, DiscoveryAnalysisSummary>> {
  if (discoveryIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('ai_analysis')
    .select(ANALYSIS_COLS)
    .eq('organization_id', organizationId)
    .in('discovery_id', discoveryIds)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const latest = new Map<string, DiscoveryAnalysisSummary>();
  for (const row of (data ?? []) as unknown as AnalysisRow[]) {
    if (!latest.has(row.discovery_id)) {
      latest.set(row.discovery_id, toAnalysis(row));
    }
  }
  return latest;
}

async function loadLatestActionPlans(
  organizationId: string,
  discoveryIds: string[],
): Promise<Map<string, DiscoveryActionPlanSummary>> {
  if (discoveryIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('ai_action_plans')
    .select(ACTION_PLAN_COLS)
    .eq('organization_id', organizationId)
    .in('discovery_id', discoveryIds)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const latest = new Map<string, DiscoveryActionPlanSummary>();
  for (const row of (data ?? []) as unknown as ActionPlanRow[]) {
    if (!latest.has(row.discovery_id)) {
      latest.set(row.discovery_id, toActionPlan(row));
    }
  }
  return latest;
}

async function loadLatestAnalysisJobs(
  organizationId: string,
  discoveryIds: string[],
): Promise<Map<string, DiscoveryAnalysisJob>> {
  if (discoveryIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('job_runs')
    .select(ANALYSIS_JOB_COLS)
    .eq('organization_id', organizationId)
    .eq('entity_type', 'discovery')
    .eq('job_name', 'analyze-discovery')
    .in('entity_id', discoveryIds)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const latest = new Map<string, DiscoveryAnalysisJob>();
  for (const row of (data ?? []) as unknown as AnalysisJobRow[]) {
    if (row.entity_id && !latest.has(row.entity_id)) {
      latest.set(row.entity_id, toAnalysisJob(row));
    }
  }
  return latest;
}

export async function listDiscoveries(
  organizationId: string,
  filter: DiscoveryFilter,
): Promise<DiscoveryListResultWithAi> {
  let q = supabase
    .from('discoveries')
    .select(SUMMARY_COLS, { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (filter.status?.length) q = q.in('status', filter.status);
  if (filter.source?.length) q = q.in('source', filter.source);
  if (filter.country) q = q.eq('country', filter.country);
  if (filter.batchId) q = q.eq('batch_id', filter.batchId);
  if (filter.search) q = q.ilike('title', `%${filter.search}%`);
  if (filter.dateFrom) q = q.gte('created_at', filter.dateFrom);
  if (filter.dateTo) q = q.lte('created_at', filter.dateTo);

  q = q.order('created_at', { ascending: filter.sort === 'oldest' });

  const from = (filter.page - 1) * filter.pageSize;
  q = q.range(from, from + filter.pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw error;

  const baseItems = ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
  const discoveryIds = baseItems.map((item) => item.id);
  const [analyses, actionPlans, analysisJobs] = await Promise.all([
    loadLatestAnalyses(organizationId, discoveryIds),
    loadLatestActionPlans(organizationId, discoveryIds),
    loadLatestAnalysisJobs(organizationId, discoveryIds),
  ]);

  return {
    items: baseItems.map((item) => ({
      ...item,
      analysis: analyses.get(item.id) ?? null,
      actionPlan: actionPlans.get(item.id) ?? null,
      analysisJob: analysisJobs.get(item.id) ?? null,
    })),
    total: count ?? 0,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}

export async function getDiscovery(
  organizationId: string,
  id: string,
): Promise<DiscoveryDetailWithAi | null> {
  const { data, error } = await supabase
    .from('discoveries')
    .select(DETAIL_COLS)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [analyses, actionPlans, analysisJobs] = await Promise.all([
    loadLatestAnalyses(organizationId, [id]),
    loadLatestActionPlans(organizationId, [id]),
    loadLatestAnalysisJobs(organizationId, [id]),
  ]);

  return {
    ...toDetail(data as unknown as DetailRow),
    analysis: analyses.get(id) ?? null,
    actionPlan: actionPlans.get(id) ?? null,
    analysisJob: analysisJobs.get(id) ?? null,
  };
}

/** Bulk status transition (review / approve / ignore). RLS requires `discoveries.write`. */
export async function setDiscoveryStatus(
  organizationId: string,
  ids: string[],
  status: DiscoveryInboxStatus,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('discoveries')
    .update({ status })
    .eq('organization_id', organizationId)
    .in('id', ids);
  if (error) throw error;
}
