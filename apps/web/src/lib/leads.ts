// Leads data layer (P5-01). Direct supabase-js access under RLS: reads use the `leads.read`
// SELECT policy; in-pipeline stage moves use `leads.write`; promotion from an opportunity and
// won/lost close go through the atomic `promote_opportunity_to_lead` / `close_lead` RPCs.
// See supabase/migrations/0034_leads.sql. All queries are org-scoped explicitly *and* by RLS.

import type {
  CloseLeadInput,
  LeadDetail,
  LeadFilter,
  LeadListResult,
  LeadSetStage,
  LeadStage,
  LeadSummary,
  Priority,
  PromoteOpportunityInput,
} from '@radar/contracts';
import { supabase } from './supabase';

const SUMMARY_COLS =
  'id, title, stage, score, priority, priority_weight, value, owner_id, opportunity_id, updated_at, created_at';
const DETAIL_COLS =
  `${SUMMARY_COLS}, description, currency, source, company_id, primary_contact_id, close_reason, closed_at, created_by`;

interface SummaryRow {
  id: string;
  title: string;
  stage: LeadStage;
  score: number;
  priority: Priority;
  priority_weight: number;
  value: number | null;
  owner_id: string | null;
  opportunity_id: string | null;
  updated_at: string;
  created_at: string;
}

interface DetailRow extends SummaryRow {
  description: string | null;
  currency: string | null;
  source: string | null;
  company_id: string | null;
  primary_contact_id: string | null;
  close_reason: string | null;
  closed_at: string | null;
  created_by: string | null;
}

function toSummary(row: SummaryRow): LeadSummary {
  return {
    id: row.id,
    title: row.title,
    stage: row.stage,
    score: row.score,
    priority: row.priority,
    priorityWeight: row.priority_weight,
    value: row.value == null ? null : Number(row.value),
    ownerId: row.owner_id,
    opportunityId: row.opportunity_id,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function toDetail(row: DetailRow): LeadDetail {
  return {
    ...toSummary(row),
    description: row.description,
    currency: row.currency,
    source: row.source,
    companyId: row.company_id,
    primaryContactId: row.primary_contact_id,
    closeReason: row.close_reason,
    closedAt: row.closed_at,
    createdBy: row.created_by,
  };
}

const SORT_COLUMN: Record<LeadFilter['sort'], { column: string; ascending: boolean }> = {
  newest: { column: 'created_at', ascending: false },
  updated: { column: 'updated_at', ascending: false },
  score: { column: 'score', ascending: false },
  priority: { column: 'priority_weight', ascending: false },
};

export async function listLeads(
  organizationId: string,
  filter: LeadFilter,
): Promise<LeadListResult> {
  let q = supabase
    .from('leads')
    .select(SUMMARY_COLS, { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (filter.stage?.length) q = q.in('stage', filter.stage);
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

export async function getLead(organizationId: string, id: string): Promise<LeadDetail | null> {
  const { data, error } = await supabase
    .from('leads')
    .select(DETAIL_COLS)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? toDetail(data as unknown as DetailRow) : null;
}

/** Move one or more leads to a non-terminal pipeline stage (won/lost go through `closeLead`). */
export async function setLeadStage(
  organizationId: string,
  ids: string[],
  stage: LeadSetStage,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('leads')
    .update({ stage })
    .eq('organization_id', organizationId)
    .in('id', ids);
  if (error) throw error;
}

/** Promote a qualified opportunity into a new active lead (flips the opportunity to promoted). */
export async function promoteOpportunity(input: PromoteOpportunityInput): Promise<LeadDetail> {
  const { data, error } = await supabase.rpc('promote_opportunity_to_lead', {
    p_opportunity: input.opportunityId,
    p_owner: input.ownerId ?? null,
  });
  if (error) throw error;
  return toDetail(data as unknown as DetailRow);
}

/** Close a lead won/lost with an optional reason. */
export async function closeLead(input: CloseLeadInput): Promise<LeadDetail> {
  const { data, error } = await supabase.rpc('close_lead', {
    p_lead: input.leadId,
    p_outcome: input.outcome,
    p_reason: input.reason ?? null,
  });
  if (error) throw error;
  return toDetail(data as unknown as DetailRow);
}
