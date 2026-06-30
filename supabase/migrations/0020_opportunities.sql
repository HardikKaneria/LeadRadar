-- Phase 4 · Opportunity Engine (P4-01).
-- Converts an analyzed + approved discovery into an `opportunities` row through an atomic,
-- authz-checked RPC: it enforces the org score threshold + human approval, carries the latest
-- analysis/action-plan signals onto the opportunity, computes a basic heat score, and flips the
-- discovery to `converted`. Reads are RLS-gated by `opportunities.read`; status edits by
-- `opportunities.write`. See docs/architecture/04-database-schema.md §4.5.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'opportunity_status') then
    create type public.opportunity_status as enum (
      'open', 'qualified', 'promoted_to_lead', 'ignored', 'expired', 'archived'
    );
  end if;
end
$$;

create table if not exists public.opportunities (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  -- discovery provenance; company_id/primary_contact_id are wired to real FKs in P4-02.
  discovery_id        uuid references public.discoveries (id) on delete set null,
  company_id          uuid,
  primary_contact_id  uuid,
  title               text not null,
  description         text,
  status              public.opportunity_status not null default 'open',
  score               integer not null default 0,
  priority            text not null default 'medium',
  priority_weight     smallint not null default 50,
  potential_value     numeric(14, 2),
  currency            text,
  heat_score          numeric(6, 2) not null default 0,
  expires_at          timestamptz,
  recommended_action  text,
  ai_explanation      text,
  owner_id            uuid references auth.users (id) on delete set null,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  check (score >= 0 and score <= 100),
  check (priority = any (array['critical', 'high', 'medium', 'low']::text[])),
  check (priority_weight = any (array[100, 75, 50, 25]::smallint[])),
  check (heat_score >= 0)
);

create index if not exists opportunities_status_score_idx
  on public.opportunities (organization_id, status, score desc);
create index if not exists opportunities_owner_idx
  on public.opportunities (organization_id, owner_id);
create index if not exists opportunities_heat_idx
  on public.opportunities (organization_id, heat_score desc);
create index if not exists opportunities_expires_idx
  on public.opportunities (organization_id, expires_at);
create index if not exists opportunities_priority_idx
  on public.opportunities (organization_id, priority_weight desc);

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;

create policy opportunities_select_read on public.opportunities
  for select using (public.has_permission(organization_id, 'opportunities.read'));

-- Status transitions / owner reassignment / soft-delete go through supabase-js under this policy.
create policy opportunities_update_write on public.opportunities
  for update
  using (public.has_permission(organization_id, 'opportunities.write'))
  with check (public.has_permission(organization_id, 'opportunities.write'));

-- Atomic conversion: gate on threshold + approval, snapshot the latest analysis/plan signals,
-- create the opportunity, and flip the discovery to `converted`. SECURITY DEFINER + explicit
-- permission check so it is safe to call from the RLS-bound web client.
create or replace function public.convert_discovery_to_opportunity(
  p_discovery uuid,
  p_owner uuid default null,
  p_force boolean default false
)
returns public.opportunities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_discovery public.discoveries;
  v_analysis public.ai_analysis;
  v_plan public.ai_action_plans;
  v_threshold integer;
  v_priority text;
  v_weight smallint;
  v_heat numeric(6, 2);
  v_created public.opportunities;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_discovery
  from public.discoveries
  where id = p_discovery and deleted_at is null
  for update;

  if not found then
    raise exception 'discovery not found';
  end if;

  v_org := v_discovery.organization_id;

  if not public.has_permission(v_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;

  if v_discovery.status = 'converted' then
    raise exception 'discovery already converted';
  end if;

  select * into v_analysis
  from public.ai_analysis
  where discovery_id = p_discovery
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'discovery has no analysis; analyze it first';
  end if;

  if v_analysis.is_bad_lead then
    raise exception 'discovery is flagged as a bad lead';
  end if;

  select coalesce((settings ->> 'scoreThreshold')::int, 60)
  into v_threshold
  from public.organizations
  where id = v_org;
  v_threshold := coalesce(v_threshold, 60);

  if not p_force and v_analysis.score < v_threshold then
    raise exception 'score % is below the approval threshold %', v_analysis.score, v_threshold;
  end if;

  select * into v_plan
  from public.ai_action_plans
  where discovery_id = p_discovery
  order by created_at desc
  limit 1;

  if found then
    v_priority := v_plan.priority;
    v_weight := v_plan.priority_weight;
  elsif v_analysis.score >= 80 then
    v_priority := 'critical'; v_weight := 100;
  elsif v_analysis.score >= 60 then
    v_priority := 'high'; v_weight := 75;
  elsif v_analysis.score >= 40 then
    v_priority := 'medium'; v_weight := 50;
  else
    v_priority := 'low'; v_weight := 25;
  end if;

  v_heat := round(least(100, v_analysis.score * 0.7 + v_weight * 0.3)::numeric, 2);

  insert into public.opportunities (
    organization_id,
    discovery_id,
    title,
    description,
    status,
    score,
    priority,
    priority_weight,
    potential_value,
    heat_score,
    recommended_action,
    ai_explanation,
    owner_id,
    created_by
  )
  values (
    v_org,
    p_discovery,
    coalesce(nullif(trim(coalesce(v_discovery.title, '')), ''), v_discovery.company_name, 'Untitled opportunity'),
    v_discovery.description,
    'open',
    v_analysis.score,
    v_priority,
    v_weight,
    v_analysis.budget_estimate,
    v_heat,
    coalesce(v_plan.recommended_action, v_analysis.recommended_action),
    v_analysis.reason,
    coalesce(p_owner, auth.uid()),
    auth.uid()
  )
  returning * into v_created;

  update public.discoveries
  set status = 'converted'
  where id = p_discovery;

  return v_created;
end;
$$;
