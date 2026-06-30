-- Phase 4 · Relationship graph (P4-03).
-- `relationship_edges` is the M7 typed, weighted graph between the entity layer (companies,
-- contacts) and opportunities: works_at, decision_maker_for, referred_by, etc. Nodes are
-- polymorphic (node_type + id) so a single edge table spans every entity kind; the SECURITY DEFINER
-- write RPCs validate that each endpoint exists in the org (real FKs can't span a polymorphic ref).
-- Reads/edits are RLS-gated by the opportunity permissions, matching the companies/contacts layer
-- (see DECISIONS [[D-033]]); writes go through the dedup-aware upsert/delete RPCs.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'relationship_node_type') then
    create type public.relationship_node_type as enum ('company', 'contact', 'opportunity');
  end if;
  if not exists (select 1 from pg_type where typname = 'relationship_edge_type') then
    create type public.relationship_edge_type as enum (
      'works_at',
      'decision_maker_for',
      'reports_to',
      'referred_by',
      'introduced_by',
      'partner_of',
      'competitor_of',
      'related_to'
    );
  end if;
end
$$;

create table if not exists public.relationship_edges (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  edge_type       public.relationship_edge_type not null,
  source_type     public.relationship_node_type not null,
  source_id       uuid not null,
  target_type     public.relationship_node_type not null,
  target_id       uuid not null,
  weight          double precision not null default 1,
  metadata        jsonb not null default '{}'::jsonb,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (weight >= 0),
  check (jsonb_typeof(metadata) = 'object'),
  check (not (source_type = target_type and source_id = target_id))
);

-- One live edge per direction + type between the same two nodes.
create unique index if not exists relationship_edges_unique_uidx
  on public.relationship_edges (
    organization_id, edge_type, source_type, source_id, target_type, target_id
  )
  where deleted_at is null;
-- Out-edges and in-edges are both queried when expanding a node's neighborhood.
create index if not exists relationship_edges_source_idx
  on public.relationship_edges (organization_id, source_type, source_id)
  where deleted_at is null;
create index if not exists relationship_edges_target_idx
  on public.relationship_edges (organization_id, target_type, target_id)
  where deleted_at is null;
create index if not exists relationship_edges_type_idx
  on public.relationship_edges (organization_id, edge_type)
  where deleted_at is null;

drop trigger if exists relationship_edges_set_updated_at on public.relationship_edges;
create trigger relationship_edges_set_updated_at
  before update on public.relationship_edges
  for each row execute function public.set_updated_at();

alter table public.relationship_edges enable row level security;

create policy relationship_edges_select_read on public.relationship_edges
  for select using (public.has_permission(organization_id, 'opportunities.read'));
create policy relationship_edges_update_write on public.relationship_edges
  for update using (public.has_permission(organization_id, 'opportunities.write'))
  with check (public.has_permission(organization_id, 'opportunities.write'));

-- Confirm a polymorphic node endpoint exists, in the org, and isn't soft-deleted.
create or replace function public.relationship_node_exists(
  p_org uuid,
  p_type public.relationship_node_type,
  p_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  case p_type
    when 'company' then
      select true into v_exists from public.companies
      where id = p_id and organization_id = p_org and deleted_at is null;
    when 'contact' then
      select true into v_exists from public.contacts
      where id = p_id and organization_id = p_org and deleted_at is null;
    when 'opportunity' then
      select true into v_exists from public.opportunities
      where id = p_id and organization_id = p_org and deleted_at is null;
  end case;
  return coalesce(v_exists, false);
end;
$$;

-- Upsert an edge: dedup on (org, edge_type, source, target). An existing match (live or
-- soft-deleted) is revived and re-weighted; otherwise a new edge is inserted. Both endpoints are
-- validated against the org before any write.
create or replace function public.upsert_relationship_edge(
  p_org uuid,
  p_edge_type public.relationship_edge_type,
  p_source_type public.relationship_node_type,
  p_source_id uuid,
  p_target_type public.relationship_node_type,
  p_target_id uuid,
  p_weight double precision default null,
  p_metadata jsonb default null
)
returns public.relationship_edges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_row public.relationship_edges;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_permission(p_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;
  if p_source_type = p_target_type and p_source_id = p_target_id then
    raise exception 'an edge cannot connect a node to itself';
  end if;
  if not public.relationship_node_exists(p_org, p_source_type, p_source_id) then
    raise exception 'source node not found in organization';
  end if;
  if not public.relationship_node_exists(p_org, p_target_type, p_target_id) then
    raise exception 'target node not found in organization';
  end if;

  select id into v_existing
  from public.relationship_edges
  where organization_id = p_org
    and edge_type = p_edge_type
    and source_type = p_source_type and source_id = p_source_id
    and target_type = p_target_type and target_id = p_target_id
  limit 1;

  if v_existing is not null then
    update public.relationship_edges
    set
      weight = coalesce(p_weight, weight),
      metadata = coalesce(p_metadata, metadata),
      deleted_at = null
    where id = v_existing
    returning * into v_row;
    return v_row;
  end if;

  insert into public.relationship_edges (
    organization_id, edge_type, source_type, source_id, target_type, target_id,
    weight, metadata, created_by
  )
  values (
    p_org, p_edge_type, p_source_type, p_source_id, p_target_type, p_target_id,
    coalesce(p_weight, 1), coalesce(p_metadata, '{}'::jsonb), auth.uid()
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Soft-delete an edge (authz-checked against the owning org).
create or replace function public.delete_relationship_edge(p_id uuid)
returns public.relationship_edges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_row public.relationship_edges;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select organization_id into v_org
  from public.relationship_edges
  where id = p_id and deleted_at is null;
  if v_org is null then
    raise exception 'relationship edge not found';
  end if;
  if not public.has_permission(v_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;

  update public.relationship_edges set deleted_at = now() where id = p_id returning * into v_row;
  return v_row;
end;
$$;
