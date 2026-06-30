
// Opportunities data layer (P4-01). Direct supabase-js access under RLS: reads use the
// `opportunities.read` SELECT policy; status edits use `opportunities.write`; conversion goes
// through the atomic `convert_discovery_to_opportunity` RPC (threshold + heat + discovery flip).
// See supabase/migrations/0020_opportunities.sql. All queries are org-scoped explicitly *and* by RLS.

import type {
  ConvertDiscoveryInput,
  OpportunityDetail,
  OpportunityFilter,
  OpportunityListResult,
  OpportunitySetStatus,
  OpportunitySummary,
  Priority,
} from '@radar/contracts';
import { supabase } from './supabase';

const SUMMARY_COLS =
  'id, title, status, score, priority, priority_weight, heat_score, potential_value, owner_id, discovery_id, created_at';
const DETAIL_COLS =
  `${SUMMARY_COLS}, description, currency, expires_at, recommended_action, ai_explanation, company_id, primary_contact_id, created_by, updated_at`;

interface SummaryRow {
  id: string;
  title: string;
  status: OpportunitySummary['status'];
  score: number;
  priority: Priority;
  priority_weight: number;
  heat_score: number;
  potential_value: number | null;
  owner_id: string | null;
  discovery_id: string | null;
  created_at: string;
}

interface DetailRow extends SummaryRow {
  description: string | null;
  currency: string | null;
  expires_at: string | null;
  recommended_action: string | null;
  ai_explanation: string | null;
  company_id: string | null;
  primary_contact_id: string | null;
  created_by: string | null;
  updated_at: string;
}

function toSummary(row: SummaryRow): OpportunitySummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    score: row.score,
    priority: row.priority,
    priorityWeight: row.priority_weight,
    heatScore: Number(row.heat_score),
    potentialValue: row.potential_value == null ? null : Number(row.potential_value),
    ownerId: row.owner_id,
    discoveryId: row.discovery_id,
    createdAt: row.created_at,
  };
}

function toDetail(row: DetailRow): OpportunityDetail {
  return {
    ...toSummary(row),
    description: row.description,
    currency: row.currency,
    expiresAt: row.expires_at,
    recommendedAction: row.recommended_action,
    aiExplanation: row.ai_explanation,
    companyId: row.company_id,
    primaryContactId: row.primary_contact_id,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

const SORT_COLUMN: Record<OpportunityFilter['sort'], { column: string; ascending: boolean }> = {
  score: { column: 'score', ascending: false },
  heat: { column: 'heat_score', ascending: false },
  newest: { column: 'created_at', ascending: false },
  priority: { column: 'priority_weight', ascending: false },
};

export async function listOpportunities(
  organizationId: string,
  filter: OpportunityFilter,
): Promise<OpportunityListResult> {
  let q = supabase
    .from('opportunities')
    .select(SUMMARY_COLS, { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (filter.status?.length) q = q.in('status', filter.status);
  if (filter.priority?.length) q = q.in('priority', filter.priority);
  if (filter.ownerId) q = q.eq('owner_id', filter.ownerId);
  if (filter.search) q = q.ilike('title', `%${filter.search}%`);

  const sort = SORT_COLUMN[filter.sort];
  q = q.order(sort.column, { ascending: sort.ascending });

  const from = (filter.page - 1) * filter.pageSize;
  q = q.range(from, from + filter.pageSize - 1);

  const { data, count, error } = await q;
  if (error) throw error;

  return {
    items: ((data ?? []) as unknown as SummaryRow[]).map(toSummary),
    total: count ?? 0,
    page: filter.page,
    pageSize: filter.pageSize,
  };
}

// ── Action Center read model (P4-05) — the homepage's "best moves today" lanes ──

export interface ActionCenterOpportunity {
  id: string;
  title: string;
  status: OpportunitySummary['status'];
  score: number;
  priority: Priority;
  heatScore: number;
  potentialValue: number | null;
  recommendedAction: string | null;
  createdAt: string;
}

export interface ActionCenter {
  highValue: ActionCenterOpportunity[];
  urgent: ActionCenterOpportunity[];
}

const ACTION_CENTER_COLS =
  'id, title, status, score, priority, heat_score, potential_value, recommended_action, created_at';

interface ActionCenterRow {
  id: string;
  title: string;
  status: OpportunitySummary['status'];
  score: number;
  priority: Priority;
  heat_score: number;
  potential_value: number | null;
  recommended_action: string | null;
  created_at: string;
}

function toActionCenterOpportunity(row: ActionCenterRow): ActionCenterOpportunity {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    score: row.score,
    priority: row.priority,
    heatScore: Number(row.heat_score),
    potentialValue: row.potential_value == null ? null : Number(row.potential_value),
    recommendedAction: row.recommended_action,
    createdAt: row.created_at,
  };
}

/**
 * Load the Action Center lanes: the top open/qualified opportunities by score (high-value) and the
 * critical/high-priority ones that need a move now (urgent). Follow-up tasks are a Phase 5 concern.
 */
export async function getActionCenter(organizationId: string, limit = 6): Promise<ActionCenter> {
  const activeStatuses: OpportunitySummary['status'][] = ['open', 'qualified'];

  const [highValue, urgent] = await Promise.all([
    supabase
      .from('opportunities')
      .select(ACTION_CENTER_COLS)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .in('status', activeStatuses)
      .order('score', { ascending: false })
      .order('priority_weight', { ascending: false })
      .limit(limit),
    supabase
      .from('opportunities')
      .select(ACTION_CENTER_COLS)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .in('status', activeStatuses)
      .in('priority', ['critical', 'high'])
      .order('priority_weight', { ascending: false })
      .order('score', { ascending: false })
      .limit(limit),
  ]);

  if (highValue.error) throw highValue.error;
  if (urgent.error) throw urgent.error;

  return {
    highValue: ((highValue.data ?? []) as unknown as ActionCenterRow[]).map(toActionCenterOpportunity),
    urgent: ((urgent.data ?? []) as unknown as ActionCenterRow[]).map(toActionCenterOpportunity),
  };
}

export async function getOpportunity(
  organizationId: string,
  id: string,
): Promise<OpportunityDetail | null> {
  const { data, error } = await supabase
    .from('opportunities')
    .select(DETAIL_COLS)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toDetail(data as unknown as DetailRow) : null;
}

export async function setOpportunityStatus(
  organizationId: string,
  ids: string[],
  status: OpportunitySetStatus,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('opportunities')
    .update({ status })
    .eq('organization_id', organizationId)
    .in('id', ids);
  if (error) throw error;
}

/** Convert an analyzed + approved discovery into an opportunity (threshold-gated unless `force`). */
export async function convertDiscovery(input: ConvertDiscoveryInput): Promise<OpportunityDetail> {
  const { data, error } = await supabase.rpc('convert_discovery_to_opportunity', {
    p_discovery: input.discoveryId,
    p_owner: input.ownerId ?? null,
    p_force: input.force,
  });
  if (error) throw error;
  return toDetail(data as unknown as DetailRow);
}
