-- Phase 5 · Lead Pipeline (P5-01).
-- Promotes a qualified opportunity into an active `leads` row, tracks it through the full
-- pipeline stages, and closes it (won/lost + reason). Promotion and close run through atomic,
-- authz-checked RPCs; in-pipeline stage moves go through supabase-js under RLS. Reads are gated
-- by `leads.read`, writes by `leads.write`. See docs/architecture/04-database-schema.md §M9.
--
-- knowledge_event emission on close is deferred to Phase 7 (P7-01) — the `knowledge_events`
-- substrate does not exist yet. `close_lead` records the outcome so P7-01 can backfill/hook later.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_stage') then
    create type public.lead_stage as enum (
      'new', 'contacted', 'reply_received', 'meeting_scheduled', 'proposal_sent',
      'negotiation', 'won', 'lost', 'on_hold'
    );
  end if;
end
$$;

create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  -- opportunity provenance; one live lead per opportunity (enforced by the partial unique index).
  opportunity_id      uuid references public.opportunities (id) on delete set null,
  company_id          uuid references public.companies (id) on delete set null,
  primary_contact_id  uuid references public.contacts (id) on delete set null,
  title               text not null,
  description         text,
  stage               public.lead_stage not null default 'new',
  score               integer not null default 0,
  priority            text not null default 'medium',
  priority_weight     smallint not null default 50,
  value               numeric(14, 2),
  currency            text,
  source              text,
  owner_id            uuid references auth.users (id) on delete set null,
  close_reason        text,
  closed_at           timestamptz,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  check (score >= 0 and score <= 100),
  check (priority = any (array['critical', 'high', 'medium', 'low']::text[])),
  check (priority_weight = any (array[100, 75, 50, 25]::smallint[]))
);

create index if not exists leads_stage_idx
  on public.leads (organization_id, stage, updated_at desc);
create index if not exists leads_owner_idx
  on public.leads (organization_id, owner_id);
create index if not exists leads_updated_idx
  on public.leads (organization_id, updated_at desc);
create index if not exists leads_opportunity_idx
  on public.leads (organization_id, opportunity_id);

-- One live (non-deleted) lead per opportunity — promotion is idempotency-guarded in the RPC too.
create unique index if not exists leads_one_live_per_opportunity_idx
  on public.leads (opportunity_id)
  where opportunity_id is not null and deleted_at is null;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;

create policy leads_select_read on public.leads
  for select using (public.has_permission(organization_id, 'leads.read'));

-- Stage moves / owner reassignment / soft-delete go through supabase-js under this policy.
create policy leads_update_write on public.leads
  for update
  using (public.has_permission(organization_id, 'leads.write'))
  with check (public.has_permission(organization_id, 'leads.write'));

-- Atomic promotion: gate on `leads.write`, carry the opportunity signals onto a fresh lead, and
-- flip the opportunity to `promoted_to_lead`. SECURITY DEFINER + explicit permission check so it is
-- safe to call from the RLS-bound web client.
create or replace function public.promote_opportunity_to_lead(
  p_opportunity uuid,
  p_owner uuid default null
)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opp public.opportunities;
  v_lead public.leads;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_opp
  from public.opportunities
  where id = p_opportunity and deleted_at is null
  for update;

  if not found then
    raise exception 'opportunity not found';
  end if;

  if not public.has_permission(v_opp.organization_id, 'leads.write') then
    raise exception 'insufficient permissions';
  end if;

  if exists (
    select 1 from public.leads
    where opportunity_id = p_opportunity and deleted_at is null
  ) then
    raise exception 'opportunity already promoted to a lead';
  end if;

  insert into public.leads (
    organization_id,
    opportunity_id,
    company_id,
    primary_contact_id,
    title,
    description,
    stage,
    score,
    priority,
    priority_weight,
    value,
    currency,
    owner_id,
    created_by
  )
  values (
    v_opp.organization_id,
    v_opp.id,
    v_opp.company_id,
    v_opp.primary_contact_id,
    v_opp.title,
    v_opp.description,
    'new',
    v_opp.score,
    v_opp.priority,
    v_opp.priority_weight,
    v_opp.potential_value,
    v_opp.currency,
    coalesce(p_owner, v_opp.owner_id, auth.uid()),
    auth.uid()
  )
  returning * into v_lead;

  update public.opportunities
  set status = 'promoted_to_lead'
  where id = p_opportunity;

  return v_lead;
end;
$$;

-- Close a lead won/lost with an optional reason. Records the outcome stage + closed_at so the
-- Phase 7 knowledge engine can hook/backfill `knowledge_events` later (P7-01).
create or replace function public.close_lead(
  p_lead uuid,
  p_outcome text,
  p_reason text default null
)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_outcome not in ('won', 'lost') then
    raise exception 'invalid close outcome %, expected won or lost', p_outcome;
  end if;

  select * into v_lead
  from public.leads
  where id = p_lead and deleted_at is null
  for update;

  if not found then
    raise exception 'lead not found';
  end if;

  if not public.has_permission(v_lead.organization_id, 'leads.write') then
    raise exception 'insufficient permissions';
  end if;

  update public.leads
  set stage = p_outcome::public.lead_stage,
      close_reason = p_reason,
      closed_at = now()
  where id = p_lead
  returning * into v_lead;

  return v_lead;
end;
$$;
