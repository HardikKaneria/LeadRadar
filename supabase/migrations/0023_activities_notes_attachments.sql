-- Phase 4 · Activities, notes & attachments (P4-07).
-- The M13 timeline layer that hangs off the entity graph: an append-only `activities` log, editable
-- `notes` (with an AI-generated flag), and `attachments` metadata. Entities are referenced
-- polymorphically by the existing `relationship_node_type` (opportunity/company/contact) + a plain
-- uuid — the same canonical entity ref as the relationship graph ([[D-034]]); writes go through
-- SECURITY DEFINER RPCs that validate the target via `relationship_node_exists` and also log a
-- matching activity. `log_activity` (SECURITY DEFINER) is the single insert path into the otherwise
-- write-locked `activities` table, so triggers and RPCs can append regardless of the caller's RLS.
-- Reads are RLS-gated by `opportunities.read`; edits by `opportunities.write` ([[D-033]]).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'activity_type') then
    create type public.activity_type as enum (
      'created',
      'status_changed',
      'converted',
      'assigned',
      'note_added',
      'attachment_added',
      'researched',
      'custom'
    );
  end if;
end
$$;

create table if not exists public.activities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type     public.relationship_node_type not null,
  entity_id       uuid not null,
  type            public.activity_type not null,
  summary         text not null,
  metadata        jsonb not null default '{}'::jsonb,
  actor_id        uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists activities_entity_idx
  on public.activities (organization_id, entity_type, entity_id, created_at desc);
create index if not exists activities_org_created_idx
  on public.activities (organization_id, created_at desc);

create table if not exists public.notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type     public.relationship_node_type not null,
  entity_id       uuid not null,
  body            text not null,
  is_ai_generated boolean not null default false,
  author_id       uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index if not exists notes_entity_idx
  on public.notes (organization_id, entity_type, entity_id, created_at desc)
  where deleted_at is null;

create table if not exists public.attachments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type     public.relationship_node_type not null,
  entity_id       uuid not null,
  bucket          text not null,
  path            text not null,
  file_name       text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (size_bytes is null or size_bytes >= 0)
);

create unique index if not exists attachments_object_uidx
  on public.attachments (organization_id, bucket, path)
  where deleted_at is null;
create index if not exists attachments_entity_idx
  on public.attachments (organization_id, entity_type, entity_id, created_at desc)
  where deleted_at is null;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.activities enable row level security;
alter table public.notes enable row level security;
alter table public.attachments enable row level security;

-- Reads gated by opportunities.read; notes/attachments edits (soft-delete) by opportunities.write.
-- `activities` has no write policy — it is append-only through `log_activity` (SECURITY DEFINER).
create policy activities_select_read on public.activities
  for select using (public.has_permission(organization_id, 'opportunities.read'));
create policy notes_select_read on public.notes
  for select using (public.has_permission(organization_id, 'opportunities.read'));
create policy notes_update_write on public.notes
  for update using (public.has_permission(organization_id, 'opportunities.write'))
  with check (public.has_permission(organization_id, 'opportunities.write'));
create policy attachments_select_read on public.attachments
  for select using (public.has_permission(organization_id, 'opportunities.read'));
create policy attachments_update_write on public.attachments
  for update using (public.has_permission(organization_id, 'opportunities.write'))
  with check (public.has_permission(organization_id, 'opportunities.write'));

-- The single append path into the write-locked activities log. SECURITY DEFINER so triggers and the
-- note/attachment RPCs can record an activity regardless of the caller's RLS.
create or replace function public.log_activity(
  p_org uuid,
  p_entity_type public.relationship_node_type,
  p_entity_id uuid,
  p_type public.activity_type,
  p_summary text,
  p_metadata jsonb default null,
  p_actor uuid default null
)
returns public.activities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.activities;
begin
  insert into public.activities (organization_id, entity_type, entity_id, type, summary, metadata, actor_id)
  values (
    p_org, p_entity_type, p_entity_id, p_type, p_summary,
    coalesce(p_metadata, '{}'::jsonb), coalesce(p_actor, auth.uid())
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Add a note to an entity (validated in-org) and log a `note_added` activity in the same call.
create or replace function public.add_note(
  p_org uuid,
  p_entity_type public.relationship_node_type,
  p_entity_id uuid,
  p_body text,
  p_is_ai_generated boolean default false
)
returns public.notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notes;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_permission(p_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'note body cannot be empty';
  end if;
  if not public.relationship_node_exists(p_org, p_entity_type, p_entity_id) then
    raise exception 'entity not found in organization';
  end if;

  insert into public.notes (organization_id, entity_type, entity_id, body, is_ai_generated, author_id)
  values (p_org, p_entity_type, p_entity_id, trim(p_body), coalesce(p_is_ai_generated, false), auth.uid())
  returning * into v_row;

  perform public.log_activity(
    p_org, p_entity_type, p_entity_id, 'note_added',
    case when coalesce(p_is_ai_generated, false) then 'AI note added' else 'Note added' end,
    jsonb_build_object('note_id', v_row.id, 'is_ai_generated', coalesce(p_is_ai_generated, false))
  );

  return v_row;
end;
$$;

-- Register an uploaded file's metadata against an entity and log an `attachment_added` activity.
-- The binary itself lands in storage out-of-band; this records the bucket/path reference.
create or replace function public.record_attachment(
  p_org uuid,
  p_entity_type public.relationship_node_type,
  p_entity_id uuid,
  p_bucket text,
  p_path text,
  p_file_name text,
  p_mime_type text default null,
  p_size_bytes bigint default null
)
returns public.attachments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attachments;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_permission(p_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;
  if nullif(trim(coalesce(p_path, '')), '') is null or nullif(trim(coalesce(p_file_name, '')), '') is null then
    raise exception 'attachment path and file name are required';
  end if;
  if not public.relationship_node_exists(p_org, p_entity_type, p_entity_id) then
    raise exception 'entity not found in organization';
  end if;

  insert into public.attachments (
    organization_id, entity_type, entity_id, bucket, path, file_name, mime_type, size_bytes, uploaded_by
  )
  values (
    p_org, p_entity_type, p_entity_id, trim(p_bucket), trim(p_path), trim(p_file_name),
    nullif(trim(coalesce(p_mime_type, '')), ''), p_size_bytes, auth.uid()
  )
  returning * into v_row;

  perform public.log_activity(
    p_org, p_entity_type, p_entity_id, 'attachment_added',
    'Attachment added: ' || trim(p_file_name),
    jsonb_build_object('attachment_id', v_row.id, 'file_name', trim(p_file_name))
  );

  return v_row;
end;
$$;

-- Soft-delete helpers (authz-checked against the owning org).
create or replace function public.delete_note(p_id uuid)
returns public.notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_row public.notes;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org from public.notes where id = p_id and deleted_at is null;
  if v_org is null then
    raise exception 'note not found';
  end if;
  if not public.has_permission(v_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;
  update public.notes set deleted_at = now() where id = p_id returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.delete_attachment(p_id uuid)
returns public.attachments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_row public.attachments;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select organization_id into v_org from public.attachments where id = p_id and deleted_at is null;
  if v_org is null then
    raise exception 'attachment not found';
  end if;
  if not public.has_permission(v_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;
  update public.attachments set deleted_at = now() where id = p_id returning * into v_row;
  return v_row;
end;
$$;

-- Auto-activities on opportunity mutations: seed the timeline on create and log every status change.
create or replace function public.opportunities_log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(
      new.organization_id, 'opportunity', new.id, 'created',
      'Opportunity created', jsonb_build_object('status', new.status), new.created_by
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.log_activity(
      new.organization_id, 'opportunity', new.id,
      case when new.status = 'promoted_to_lead' then 'converted' else 'status_changed' end,
      'Status changed from ' || old.status || ' to ' || new.status,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists opportunities_log_created on public.opportunities;
create trigger opportunities_log_created
  after insert on public.opportunities
  for each row execute function public.opportunities_log_activity();
drop trigger if exists opportunities_log_status on public.opportunities;
create trigger opportunities_log_status
  after update on public.opportunities
  for each row execute function public.opportunities_log_activity();
