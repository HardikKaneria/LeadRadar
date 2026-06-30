-- Phase 2 · Company Brain (P2-01).
-- Versioned org profile stored directly in Supabase and read by the web under RLS.
-- Writes go through a dedicated RPC so version numbers and the active-profile invariant stay atomic.

create table public.company_profiles (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  version           integer not null,
  is_active         boolean not null default false,
  services          text[] not null default '{}',
  priority_services text[] not null default '{}',
  target_industries text[] not null default '{}',
  ideal_customer    jsonb not null default '{"companySizes":[],"buyerRoles":[],"regions":[],"painPoints":[]}'::jsonb,
  target_countries  text[] not null default '{}',
  min_budget        numeric(14, 2),
  bad_lead_rules    jsonb not null default '{"logic":"any","rules":[]}'::jsonb,
  outreach_tone     text,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  unique (organization_id, version)
);

create unique index company_profiles_active_uidx
  on public.company_profiles (organization_id) where is_active;
create index company_profiles_org_version_idx
  on public.company_profiles (organization_id, version desc);

alter table public.company_profiles enable row level security;

create policy company_profiles_select_manage on public.company_profiles
  for select using (public.has_permission(organization_id, 'company_brain.manage'));

create or replace function public.create_company_profile_version(
  org uuid,
  services text[],
  priority_services text[],
  target_industries text[],
  ideal_customer jsonb,
  target_countries text[],
  min_budget numeric,
  bad_lead_rules jsonb,
  outreach_tone text
)
returns public.company_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
  created_row public.company_profiles;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.has_permission(org, 'company_brain.manage') then
    raise exception 'insufficient permissions';
  end if;

  perform 1
  from public.organizations
  where id = org
  for update;

  if not found then
    raise exception 'organization not found';
  end if;

  select coalesce(max(version), 0) + 1
  into next_version
  from public.company_profiles
  where organization_id = org;

  update public.company_profiles
  set is_active = false
  where organization_id = org
    and is_active = true;

  insert into public.company_profiles (
    organization_id,
    version,
    is_active,
    services,
    priority_services,
    target_industries,
    ideal_customer,
    target_countries,
    min_budget,
    bad_lead_rules,
    outreach_tone,
    created_by
  )
  values (
    org,
    next_version,
    true,
    coalesce(services, '{}'),
    coalesce(priority_services, '{}'),
    coalesce(target_industries, '{}'),
    coalesce(ideal_customer, '{"companySizes":[],"buyerRoles":[],"regions":[],"painPoints":[]}'::jsonb),
    coalesce(target_countries, '{}'),
    min_budget,
    coalesce(bad_lead_rules, '{"logic":"any","rules":[]}'::jsonb),
    nullif(trim(coalesce(outreach_tone, '')), ''),
    auth.uid()
  )
  returning * into created_row;

  return created_row;
end;
$$;
