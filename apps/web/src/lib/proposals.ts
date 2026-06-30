// Proposals data layer (P6-03). Reads use supabase-js under RLS (leads.read/leads.write); job
// generation and status mutations go through the thin NestJS API (api.ts).
// See supabase/migrations/0040_proposals.sql.

import type {
  ProposalDetail,
  ProposalFilterInput,
  ProposalSummary,
} from '@radar/contracts';
import { supabase } from './supabase';

// ── Reads (Supabase / RLS) ──────────────────────────────────────────────────

export async function listProposals(
  organizationId: string,
  filter?: ProposalFilterInput,
): Promise<ProposalSummary[]> {
  let q = supabase
    .from('proposals')
    .select('id, lead_id, opportunity_id, title, status, value, currency, created_at, updated_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (filter?.entityType === 'lead' && filter.entityId) q = q.eq('lead_id', filter.entityId);
  else if (filter?.entityType === 'opportunity' && filter.entityId)
    q = q.eq('opportunity_id', filter.entityId);
  if (filter?.status) q = q.eq('status', filter.status as never);

  const { data, error } = await q;
  if (error) throw new Error(`Failed to list proposals: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map(toProposalSummary);
}

export async function getProposal(organizationId: string, proposalId: string): Promise<ProposalDetail> {
  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', proposalId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) throw new Error(`Proposal ${proposalId} not found`);
  const row = data as Record<string, unknown>;
  return {
    ...toProposalSummary(row),
    content: row.content ?? null,
    aiRequestId: (row.ai_request_id as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    rejectedAt: (row.rejected_at as string | null) ?? null,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toProposalSummary(row: Record<string, unknown>): ProposalSummary {
  return {
    id: row.id as string,
    leadId: (row.lead_id as string | null) ?? null,
    opportunityId: (row.opportunity_id as string | null) ?? null,
    title: row.title as string,
    status: row.status as ProposalSummary['status'],
    value: row.value != null ? Number(row.value) : null,
    currency: (row.currency as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
