-- ── Repair: add any columns/types that migrations may have skipped ────────────
-- All statements use IF NOT EXISTS / add column if not exists so it is safe to
-- run on a fresh DB (no-ops) or a partially-migrated one (fills the gaps).

-- ── 1. Enum types ─────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'activity_type') then
    create type public.activity_type as enum (
      'created', 'status_changed', 'converted', 'assigned',
      'note_added', 'attachment_added', 'researched', 'custom'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'relationship_node_type') then
    create type public.relationship_node_type as enum ('company', 'contact', 'opportunity');
  end if;

  if not exists (select 1 from pg_type where typname = 'relationship_edge_type') then
    create type public.relationship_edge_type as enum (
      'opportunity_company', 'opportunity_contact',
      'lead_company', 'lead_contact', 'company_contact', 'custom'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'opportunity_status') then
    create type public.opportunity_status as enum (
      'open', 'qualified', 'promoted_to_lead', 'lost', 'archived'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_stage') then
    create type public.lead_stage as enum (
      'new', 'contacted', 'qualified', 'proposal_sent',
      'negotiation', 'won', 'lost', 'on_hold'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('open', 'done', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'outreach_channel') then
    create type public.outreach_channel as enum ('email', 'linkedin', 'whatsapp', 'call', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'outreach_direction') then
    create type public.outreach_direction as enum ('outbound', 'inbound', 'internal_note');
  end if;

  if not exists (select 1 from pg_type where typname = 'outreach_status') then
    create type public.outreach_status as enum ('draft', 'ready', 'sent', 'failed', 'received');
  end if;

  if not exists (select 1 from pg_type where typname = 'proposal_status') then
    create type public.proposal_status as enum ('draft', 'ready', 'sent', 'accepted', 'rejected', 'expired');
  end if;

  if not exists (select 1 from pg_type where typname = 'knowledge_event_type') then
    create type public.knowledge_event_type as enum (
      'lead_won', 'lead_lost', 'lead_stalled', 'opportunity_promoted',
      'opportunity_archived', 'proposal_accepted', 'proposal_rejected', 'custom'
    );
  end if;
end
$$;

-- ── 2. activities ─────────────────────────────────────────────────────────────
-- migration 0001 created this table with columns: verb, meta
-- migration 0023 expected: type (activity_type enum), summary, metadata
-- We add the new columns, backfill from the old ones, then drop the old ones.

-- 2a. Add missing columns with safe defaults so existing rows don't violate NOT NULL
alter table public.activities
  add column if not exists type     text not null default 'custom',
  add column if not exists summary  text not null default '',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- actor_id may already exist in 0001 schema, so guard it
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'actor_id'
  ) then
    alter table public.activities
      add column actor_id uuid references auth.users (id) on delete set null;
  end if;
end
$$;

-- 2b. Backfill from old columns if they exist
do $$
begin
  -- Backfill type from verb
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'verb'
  ) then
    update public.activities set type = verb where type = 'custom';
  end if;

  -- Backfill metadata from meta
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activities' and column_name = 'meta'
  ) then
    update public.activities set metadata = meta where metadata = '{}'::jsonb;
  end if;
end
$$;

-- 2c. Drop the defaults now that existing rows are filled
alter table public.activities
  alter column type    drop default,
  alter column summary drop default;

-- 2d. Convert type column to the proper enum
-- (safe even if activity_type enum doesn't cover old verb values — casts unknown → 'custom')
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'activities' and column_name = 'type') = 'text' then

    -- Clamp any unrecognised verb values to 'custom'
    update public.activities
    set type = 'custom'
    where type not in (
      'created','status_changed','converted','assigned',
      'note_added','attachment_added','researched','custom'
    );

    alter table public.activities
      alter column type type public.activity_type
      using type::public.activity_type;
  end if;
end
$$;

create index if not exists activities_entity_idx
  on public.activities (organization_id, entity_type, entity_id, created_at desc);
create index if not exists activities_org_created_idx
  on public.activities (organization_id, created_at desc);

-- ── 3. notes ─────────────────────────────────────────────────────────────────

alter table public.notes
  add column if not exists is_ai_generated boolean not null default false,
  add column if not exists author_id       uuid references auth.users (id) on delete set null,
  add column if not exists updated_at      timestamptz not null default now(),
  add column if not exists deleted_at      timestamptz;

-- ── 4. attachments ────────────────────────────────────────────────────────────

alter table public.attachments
  add column if not exists bucket      text,
  add column if not exists path        text,
  add column if not exists file_name   text,
  add column if not exists mime_type   text,
  add column if not exists size_bytes  bigint,
  add column if not exists uploaded_by uuid references auth.users (id) on delete set null,
  add column if not exists deleted_at  timestamptz;

-- ── 5. opportunities ──────────────────────────────────────────────────────────

alter table public.opportunities
  add column if not exists company_id          uuid,
  add column if not exists primary_contact_id  uuid,
  add column if not exists heat_score          numeric(6,2) not null default 0,
  add column if not exists expires_at          timestamptz,
  add column if not exists recommended_action  text,
  add column if not exists ai_explanation      text,
  add column if not exists deleted_at          timestamptz;

-- ── 6. companies ─────────────────────────────────────────────────────────────

alter table public.companies
  add column if not exists industry   text,
  add column if not exists country    text,
  add column if not exists size       text,
  add column if not exists tech_stack text[] not null default '{}',
  add column if not exists enrichment jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz;

-- ── 7. contacts ───────────────────────────────────────────────────────────────

alter table public.contacts
  add column if not exists company_id   uuid references public.companies (id) on delete set null,
  add column if not exists phone        text,
  add column if not exists title        text,
  add column if not exists linkedin_url text,
  add column if not exists deleted_at   timestamptz;

-- ── 8. leads ─────────────────────────────────────────────────────────────────

alter table public.leads
  add column if not exists opportunity_id     uuid references public.opportunities (id) on delete set null,
  add column if not exists company_id         uuid references public.companies (id) on delete set null,
  add column if not exists primary_contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists value              numeric(14,2),
  add column if not exists currency           text,
  add column if not exists source             text,
  add column if not exists close_reason       text,
  add column if not exists closed_at          timestamptz,
  add column if not exists deleted_at         timestamptz;

-- ── 9. tasks ─────────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists description text,
  add column if not exists due_at       timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists deleted_at   timestamptz;

-- ── 10. notification_preferences ─────────────────────────────────────────────

alter table public.notification_preferences
  add column if not exists notify_opportunity_expiring boolean not null default true,
  add column if not exists notify_lead_resurrection    boolean not null default true;

-- ── 11. billing_plans ────────────────────────────────────────────────────────

alter table public.billing_plans
  add column if not exists features jsonb not null default '[]'::jsonb;

-- ── 12. conversations ─────────────────────────────────────────────────────────

alter table public.conversations
  add column if not exists company_id      uuid references public.companies  (id) on delete set null,
  add column if not exists contact_id      uuid references public.contacts   (id) on delete set null,
  add column if not exists summary         text,
  add column if not exists last_message_at timestamptz,
  add column if not exists deleted_at      timestamptz;

-- ── 13. opportunity_embeddings ────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'opportunities'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'opportunities' and column_name = 'embedding'
  ) then
    -- Only add if the vector extension is available
    if exists (select 1 from pg_extension where extname = 'vector') then
      alter table public.opportunities add column embedding vector(1536);
    end if;
  end if;
end
$$;

-- ── 14. Recreate log_activity RPC (idempotent) ───────────────────────────────

create or replace function public.log_activity(
  p_org         uuid,
  p_entity_type public.relationship_node_type,
  p_entity_id   uuid,
  p_type        public.activity_type,
  p_summary     text,
  p_metadata    jsonb default null,
  p_actor       uuid default null
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
    p_org, p_entity_type::text, p_entity_id, p_type,
    coalesce(nullif(trim(p_summary), ''), p_type::text),
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_actor, auth.uid())
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Keep old activities RLS policy working regardless of entity_type column type
drop policy if exists activities_select_member on public.activities;
drop policy if exists activities_select_read   on public.activities;
create policy activities_select_read on public.activities
  for select using (public.has_permission(organization_id, 'opportunities.read'));
