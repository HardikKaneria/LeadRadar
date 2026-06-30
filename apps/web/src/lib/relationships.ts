
// Relationship graph data layer (P4-03). Direct supabase-js access under RLS: reads use the
// `opportunities.read` SELECT policy; writes go through the SECURITY DEFINER RPCs
// (`upsert_relationship_edge`, `delete_relationship_edge`) gated by `opportunities.write`, which
// validate that both polymorphic endpoints exist in the org. See
// supabase/migrations/0022_relationship_edges.sql. Org-scoped by RLS.

import type {
  RelationshipEdge,
  RelationshipNodeRef,
  UpsertRelationshipEdgeInput,
} from '@radar/contracts';
import { supabase } from './supabase';

const EDGE_COLS =
  'id, edge_type, source_type, source_id, target_type, target_id, weight, metadata, created_at, updated_at';

interface RelationshipEdgeRow {
  id: string;
  edge_type: RelationshipEdge['edgeType'];
  source_type: RelationshipEdge['sourceType'];
  source_id: string;
  target_type: RelationshipEdge['targetType'];
  target_id: string;
  weight: number;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

function toRelationshipEdge(row: RelationshipEdgeRow): RelationshipEdge {
  return {
    id: row.id,
    edgeType: row.edge_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    targetType: row.target_type,
    targetId: row.target_id,
    weight: row.weight,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** List every live edge touching a node (either as source or target). */
export async function listEntityEdges(
  organizationId: string,
  node: RelationshipNodeRef,
): Promise<RelationshipEdge[]> {
  const { data, error } = await supabase
    .from('relationship_edges')
    .select(EDGE_COLS)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .or(
      `and(source_type.eq.${node.type},source_id.eq.${node.id}),` +
        `and(target_type.eq.${node.type},target_id.eq.${node.id})`,
    )
    .order('weight', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as RelationshipEdgeRow[]).map(toRelationshipEdge);
}

/** Create or revive an edge (dedup on org + type + source + target) for the active org. */
export async function upsertRelationshipEdge(
  organizationId: string,
  input: UpsertRelationshipEdgeInput,
): Promise<RelationshipEdge> {
  const { data, error } = await supabase.rpc('upsert_relationship_edge', {
    p_org: organizationId,
    p_edge_type: input.edgeType,
    p_source_type: input.source.type,
    p_source_id: input.source.id,
    p_target_type: input.target.type,
    p_target_id: input.target.id,
    p_weight: input.weight ?? null,
    p_metadata: input.metadata ?? null,
  });
  if (error) throw error;
  return toRelationshipEdge(data as unknown as RelationshipEdgeRow);
}

/** Soft-delete an edge. */
export async function deleteRelationshipEdge(id: string): Promise<RelationshipEdge> {
  const { data, error } = await supabase.rpc('delete_relationship_edge', { p_id: id });
  if (error) throw error;
  return toRelationshipEdge(data as unknown as RelationshipEdgeRow);
}
