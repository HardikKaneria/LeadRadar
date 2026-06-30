-- Phase 10 · Lead Hunting capture ingestion (P10-03).
-- Adds the missing many-to-many capture-session link and the multi-fingerprint dedup seam so
-- repeated visible-post captures can attach to a canonical raw post without duplicating research.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'raw_post_fingerprint_type') then
    create type public.raw_post_fingerprint_type as enum (
      'post_url',
      'post_text_hash',
      'owner_profile_text',
      'owner_name_date_excerpt',
      'company_text'
    );
  end if;
end
$$;

create table if not exists public.lead_search_session_posts (
  id                 bigint generated always as identity primary key,
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  search_session_id  uuid not null references public.lead_search_sessions (id) on delete cascade,
  raw_post_id        uuid not null references public.raw_posts (id) on delete cascade,
  capture_index      integer not null,
  was_duplicate      boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (search_session_id, raw_post_id),
  unique (search_session_id, capture_index),
  check (capture_index > 0)
);

create index if not exists lead_search_session_posts_org_session_idx
  on public.lead_search_session_posts (organization_id, search_session_id, capture_index);
create index if not exists lead_search_session_posts_org_raw_post_idx
  on public.lead_search_session_posts (organization_id, raw_post_id, created_at desc);

create table if not exists public.raw_post_fingerprints (
  id                bigint generated always as identity primary key,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  raw_post_id       uuid not null references public.raw_posts (id) on delete cascade,
  fingerprint_type  public.raw_post_fingerprint_type not null,
  fingerprint_hash  text not null,
  created_at        timestamptz not null default now(),
  unique (organization_id, fingerprint_type, fingerprint_hash)
);

create index if not exists raw_post_fingerprints_raw_post_idx
  on public.raw_post_fingerprints (organization_id, raw_post_id, created_at desc);
create index if not exists raw_post_fingerprints_lookup_idx
  on public.raw_post_fingerprints (organization_id, fingerprint_type, fingerprint_hash);
create unique index if not exists post_research_jobs_org_raw_post_uidx
  on public.post_research_jobs (organization_id, raw_post_id);

create or replace function public.can_read_lead_hunting_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lead_search_sessions lss
    where lss.id = p_session
      and lss.deleted_at is null
      and public.can_read_lead_hunting_capture(lss.organization_id, lss.captured_by_user_id)
  );
$$;

create or replace function public.can_read_raw_post(p_raw_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.raw_posts rp
    where rp.id = p_raw_post
      and rp.deleted_at is null
      and public.can_read_lead_hunting_capture(rp.organization_id, rp.captured_by_user_id)
  );
$$;

alter table public.lead_search_session_posts enable row level security;
alter table public.raw_post_fingerprints enable row level security;

drop policy if exists lead_search_session_posts_select_read on public.lead_search_session_posts;
create policy lead_search_session_posts_select_read on public.lead_search_session_posts
  for select using (public.can_read_lead_hunting_session(search_session_id));

drop policy if exists raw_post_fingerprints_select_read on public.raw_post_fingerprints;
create policy raw_post_fingerprints_select_read on public.raw_post_fingerprints
  for select using (public.can_read_raw_post(raw_post_id));
