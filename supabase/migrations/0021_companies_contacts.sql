-- Phase 4 · Company & contact graph (P4-02).
-- `companies`/`contacts` are the M7 entity layer behind opportunities (and later leads). Writes go
-- through upsert RPCs that dedup on domain/email (atomic, authz-checked) plus merge RPCs that
-- repoint references and soft-delete the duplicate. Reads/edits are RLS-gated by the opportunity
-- permissions (the closest M6/M7 owner; no dedicated companies.* permission exists — see DECISIONS).
-- This migration also wires the FK-less opportunity columns left by P4-01 to real FKs.

create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  domain          citext,
  industry        text,
  country         text,
  size            text,
  tech_stack      text[] not null default '{}',
  enrichment      jsonb not null default '{}'::jsonb,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (jsonb_typeof(enrichment) = 'object')
);

create unique index if not exists companies_org_domain_uidx
  on public.companies (organization_id, domain)
  where domain is not null and deleted_at is null;
create index if not exists companies_name_trgm_idx
  on public.companies using gin (name gin_trgm_ops);
create index if not exists companies_org_idx
  on public.companies (organization_id, created_at desc);

create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id      uuid references public.companies (id) on delete set null,
  name            text not null,
  email           citext,
  phone           text,
  title           text,
  linkedin_url    text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create unique index if not exists contacts_org_email_uidx
  on public.contacts (organization_id, email)
  where email is not null and deleted_at is null;
create index if not exists contacts_org_company_idx
  on public.contacts (organization_id, company_id);

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();
drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.contacts enable row level security;

create policy companies_select_read on public.companies
  for select using (public.has_permission(organization_id, 'opportunities.read'));
create policy companies_update_write on public.companies
  for update using (public.has_permission(organization_id, 'opportunities.write'))
  with check (public.has_permission(organization_id, 'opportunities.write'));
create policy contacts_select_read on public.contacts
  for select using (public.has_permission(organization_id, 'opportunities.read'));
create policy contacts_update_write on public.contacts
  for update using (public.has_permission(organization_id, 'opportunities.write'))
  with check (public.has_permission(organization_id, 'opportunities.write'));

-- Wire the provenance columns P4-01 left FK-less now that the target tables exist.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'opportunities_company_id_fkey') then
    alter table public.opportunities
      add constraint opportunities_company_id_fkey
      foreign key (company_id) references public.companies (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opportunities_primary_contact_id_fkey') then
    alter table public.opportunities
      add constraint opportunities_primary_contact_id_fkey
      foreign key (primary_contact_id) references public.contacts (id) on delete set null;
  end if;
end
$$;

-- Upsert a company: dedup on (org, domain) when a domain is given, else on a case-insensitive name
-- match. Existing non-null fields are preserved unless the caller supplies a replacement.
create or replace function public.upsert_company(
  p_org uuid,
  p_name text,
  p_domain text default null,
  p_industry text default null,
  p_country text default null,
  p_size text default null,
  p_tech_stack text[] default null,
  p_enrichment jsonb default null
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain citext := nullif(trim(coalesce(p_domain, '')), '')::citext;
  v_existing uuid;
  v_row public.companies;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_permission(p_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;

  if v_domain is not null then
    select id into v_existing
    from public.companies
    where organization_id = p_org and domain = v_domain and deleted_at is null
    limit 1;
  else
    select id into v_existing
    from public.companies
    where organization_id = p_org and lower(name) = lower(p_name) and deleted_at is null
    limit 1;
  end if;

  if v_existing is not null then
    update public.companies
    set
      name = p_name,
      domain = coalesce(v_domain, domain),
      industry = coalesce(nullif(trim(coalesce(p_industry, '')), ''), industry),
      country = coalesce(nullif(trim(coalesce(p_country, '')), ''), country),
      size = coalesce(nullif(trim(coalesce(p_size, '')), ''), size),
      tech_stack = coalesce(p_tech_stack, tech_stack),
      enrichment = coalesce(p_enrichment, enrichment)
    where id = v_existing
    returning * into v_row;
    return v_row;
  end if;

  insert into public.companies (
    organization_id, name, domain, industry, country, size, tech_stack, enrichment, created_by
  )
  values (
    p_org,
    p_name,
    v_domain,
    nullif(trim(coalesce(p_industry, '')), ''),
    nullif(trim(coalesce(p_country, '')), ''),
    nullif(trim(coalesce(p_size, '')), ''),
    coalesce(p_tech_stack, '{}'),
    coalesce(p_enrichment, '{}'::jsonb),
    auth.uid()
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Upsert a contact: dedup on (org, email) when an email is given, else on (company, name).
create or replace function public.upsert_contact(
  p_org uuid,
  p_name text,
  p_company uuid default null,
  p_email text default null,
  p_phone text default null,
  p_title text default null,
  p_linkedin_url text default null
)
returns public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email citext := nullif(trim(coalesce(p_email, '')), '')::citext;
  v_existing uuid;
  v_row public.contacts;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_permission(p_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;

  if v_email is not null then
    select id into v_existing
    from public.contacts
    where organization_id = p_org and email = v_email and deleted_at is null
    limit 1;
  elsif p_company is not null then
    select id into v_existing
    from public.contacts
    where organization_id = p_org and company_id = p_company
      and lower(name) = lower(p_name) and deleted_at is null
    limit 1;
  end if;

  if v_existing is not null then
    update public.contacts
    set
      name = p_name,
      company_id = coalesce(p_company, company_id),
      email = coalesce(v_email, email),
      phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
      title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
      linkedin_url = coalesce(nullif(trim(coalesce(p_linkedin_url, '')), ''), linkedin_url)
    where id = v_existing
    returning * into v_row;
    return v_row;
  end if;

  insert into public.contacts (
    organization_id, company_id, name, email, phone, title, linkedin_url, created_by
  )
  values (
    p_org,
    p_company,
    p_name,
    v_email,
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_title, '')), ''),
    nullif(trim(coalesce(p_linkedin_url, '')), ''),
    auth.uid()
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- Merge a duplicate company into a primary: repoint contacts + opportunities, then soft-delete it.
create or replace function public.merge_companies(p_primary uuid, p_duplicate uuid)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_dup_org uuid;
  v_row public.companies;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_primary = p_duplicate then
    raise exception 'cannot merge a company into itself';
  end if;

  select organization_id into v_org from public.companies where id = p_primary and deleted_at is null;
  select organization_id into v_dup_org from public.companies where id = p_duplicate and deleted_at is null;
  if v_org is null or v_dup_org is null then
    raise exception 'company not found';
  end if;
  if v_org <> v_dup_org then
    raise exception 'cannot merge companies across organizations';
  end if;
  if not public.has_permission(v_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;

  update public.contacts set company_id = p_primary where company_id = p_duplicate;
  update public.opportunities set company_id = p_primary where company_id = p_duplicate;
  update public.companies set deleted_at = now() where id = p_duplicate;

  select * into v_row from public.companies where id = p_primary;
  return v_row;
end;
$$;

-- Merge a duplicate contact into a primary: repoint opportunities, then soft-delete it.
create or replace function public.merge_contacts(p_primary uuid, p_duplicate uuid)
returns public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_dup_org uuid;
  v_row public.contacts;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_primary = p_duplicate then
    raise exception 'cannot merge a contact into itself';
  end if;

  select organization_id into v_org from public.contacts where id = p_primary and deleted_at is null;
  select organization_id into v_dup_org from public.contacts where id = p_duplicate and deleted_at is null;
  if v_org is null or v_dup_org is null then
    raise exception 'contact not found';
  end if;
  if v_org <> v_dup_org then
    raise exception 'cannot merge contacts across organizations';
  end if;
  if not public.has_permission(v_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;

  update public.opportunities set primary_contact_id = p_primary where primary_contact_id = p_duplicate;
  update public.contacts set deleted_at = now() where id = p_duplicate;

  select * into v_row from public.contacts where id = p_primary;
  return v_row;
end;
$$;
