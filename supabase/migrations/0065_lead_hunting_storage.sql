-- Phase 10 · Lead Hunting Research Pipeline (P10-01).
-- Tenant-facing M16 storage: search sessions, unique raw posts, research jobs/reports,
-- classifications, archive rows, and evidence logs. This slice intentionally reuses the existing
-- discovery permission model for read RLS (`discoveries.read` / `discoveries.read_own`) so P10-01
-- can ship without dragging the dedicated `lead_hunting.*` catalog work from P10-11 into the same
-- migration. Writes remain service-role / governed-API owned for now, mirroring `job_runs` and
-- `ai_analysis`; direct operator mutations arrive in later Phase 10 tasks.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'raw_post_status') then
    create type public.raw_post_status as enum (
      'raw_captured',
      'duplicate_linked',
      'queued_for_research',
      'researching',
      'provider_post_enriched',
      'person_resolved',
      'company_resolved',
      'website_found',
      'website_researched',
      'email_checked',
      'management_found',
      'country_resolved',
      'evidence_built',
      'ai_classified',
      'qualified_lead',
      'needs_review',
      'archived',
      'rejected',
      'failed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'research_job_stage') then
    create type public.research_job_stage as enum (
      'dedupe',
      'linkedin_post_lookup',
      'linkedin_profile_lookup',
      'linkedin_company_lookup',
      'person_resolver',
      'company_resolver',
      'website_discovery',
      'website_crawl',
      'email_discovery',
      'management_discovery',
      'country_resolution',
      'evidence_building',
      'ai_classification',
      'decision_routing'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_hunting_classification') then
    create type public.lead_hunting_classification as enum (
      'actual_requirement',
      'hiring_requirement',
      'service_needed',
      'vendor_needed',
      'partnership_opportunity',
      'funding_signal',
      'expansion_signal',
      'complaint_or_pain_signal',
      'buying_intent_signal',
      'informational_post',
      'personal_branding_post',
      'news_update',
      'promotion_only',
      'job_seeker_post',
      'irrelevant',
      'spam'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'archived_post_category') then
    create type public.archived_post_category as enum (
      'market_insight',
      'competitor_activity',
      'industry_news',
      'educational_content',
      'personal_branding',
      'general_update',
      'irrelevant',
      'spam'
    );
  end if;
end
$$;

create table if not exists public.lead_search_sessions (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete cascade,
  source_platform           public.discovery_source not null default 'linkedin',
  search_query              text,
  search_url                text,
  captured_by_user_id       uuid references auth.users (id) on delete set null,
  capture_mode              text not null default 'visible_posts',
  total_posts_captured      integer not null default 0,
  total_unique_posts        integer not null default 0,
  total_duplicates          integer not null default 0,
  total_qualified           integer not null default 0,
  total_needs_review        integer not null default 0,
  total_archived            integer not null default 0,
  total_rejected            integer not null default 0,
  status                    text not null default 'captured',
  parser_version            text,
  raw_payload               jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz,
  check (total_posts_captured >= 0),
  check (total_unique_posts >= 0),
  check (total_duplicates >= 0),
  check (total_qualified >= 0),
  check (total_needs_review >= 0),
  check (total_archived >= 0),
  check (total_rejected >= 0)
);

create index if not exists lead_search_sessions_org_created_idx
  on public.lead_search_sessions (organization_id, created_at desc);
create index if not exists lead_search_sessions_user_created_idx
  on public.lead_search_sessions (organization_id, captured_by_user_id, created_at desc);
create index if not exists lead_search_sessions_status_idx
  on public.lead_search_sessions (organization_id, status, created_at desc);

drop trigger if exists lead_search_sessions_set_updated_at on public.lead_search_sessions;
create trigger lead_search_sessions_set_updated_at
  before update on public.lead_search_sessions
  for each row execute function public.set_updated_at();

create table if not exists public.raw_posts (
  id                         uuid primary key default gen_random_uuid(),
  organization_id            uuid not null references public.organizations (id) on delete cascade,
  search_session_id          uuid references public.lead_search_sessions (id) on delete set null,
  discovery_id               uuid references public.discoveries (id) on delete set null,
  source_platform            public.discovery_source not null default 'linkedin',
  post_url                   text,
  post_text                  text,
  post_text_hash             text,
  post_owner_name            text,
  post_owner_headline        text,
  post_owner_profile_url     text,
  visible_company_name       text,
  visible_company_url        text,
  post_date                  timestamptz,
  reaction_count             integer,
  comment_count              integer,
  repost_count               integer,
  media_text                 text,
  dedup_hash                 text not null,
  duplicate_of_raw_post_id   uuid references public.raw_posts (id) on delete set null,
  raw_payload                jsonb not null default '{}'::jsonb,
  status                     public.raw_post_status not null default 'raw_captured',
  failure_reason             text,
  captured_by_user_id        uuid references auth.users (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  deleted_at                 timestamptz
);

create unique index if not exists raw_posts_org_dedup_uidx
  on public.raw_posts (organization_id, dedup_hash)
  where deleted_at is null;
create index if not exists raw_posts_org_status_idx
  on public.raw_posts (organization_id, status, created_at desc);
create index if not exists raw_posts_session_idx
  on public.raw_posts (organization_id, search_session_id, created_at desc);
create index if not exists raw_posts_discovery_idx
  on public.raw_posts (organization_id, discovery_id);
create index if not exists raw_posts_post_url_idx
  on public.raw_posts (organization_id, post_url);
create index if not exists raw_posts_raw_payload_gin
  on public.raw_posts using gin (raw_payload);

drop trigger if exists raw_posts_set_updated_at on public.raw_posts;
create trigger raw_posts_set_updated_at
  before update on public.raw_posts
  for each row execute function public.set_updated_at();

create table if not exists public.post_research_jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  raw_post_id      uuid not null references public.raw_posts (id) on delete cascade,
  -- soft ref: job_runs is partitioned (composite PK (id, created_at)), so it can't be FK'd by id alone.
  job_run_id       uuid,
  current_stage    public.research_job_stage not null default 'dedupe',
  status           public.job_status not null default 'queued',
  progress         smallint not null default 0,
  retry_count      integer not null default 0,
  max_retries      integer not null default 3,
  last_error       text,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (progress >= 0 and progress <= 100),
  check (retry_count >= 0),
  check (max_retries >= 0)
);

create index if not exists post_research_jobs_org_status_idx
  on public.post_research_jobs (organization_id, status, created_at desc);
create index if not exists post_research_jobs_raw_post_idx
  on public.post_research_jobs (organization_id, raw_post_id, created_at desc);
create index if not exists post_research_jobs_job_run_idx
  on public.post_research_jobs (job_run_id);

drop trigger if exists post_research_jobs_set_updated_at on public.post_research_jobs;
create trigger post_research_jobs_set_updated_at
  before update on public.post_research_jobs
  for each row execute function public.set_updated_at();

-- P10-01 intentionally skips separate `resolved_people` / `resolved_companies` staging tables.
-- The report points at canonical M7 contacts/companies directly when a resolver has enough
-- confidence to upsert them; ambiguous or partial resolver output still lives in report_json and
-- field_evidence_logs.
create table if not exists public.post_research_reports (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  raw_post_id          uuid not null references public.raw_posts (id) on delete cascade,
  person_summary       text,
  company_summary      text,
  website_summary      text,
  email_summary        text,
  management_summary   text,
  country_summary      text,
  opportunity_summary  text,
  primary_contact_id   uuid references public.contacts (id) on delete set null,
  primary_company_id   uuid references public.companies (id) on delete set null,
  target_company_id    uuid references public.companies (id) on delete set null,
  confidence_score     numeric(5, 2),
  report_json          jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100))
);

create index if not exists post_research_reports_raw_post_idx
  on public.post_research_reports (organization_id, raw_post_id, created_at desc);
create index if not exists post_research_reports_primary_company_idx
  on public.post_research_reports (organization_id, primary_company_id);

drop trigger if exists post_research_reports_set_updated_at on public.post_research_reports;
create trigger post_research_reports_set_updated_at
  before update on public.post_research_reports
  for each row execute function public.set_updated_at();

create table if not exists public.post_classifications (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  raw_post_id           uuid not null references public.raw_posts (id) on delete cascade,
  -- soft ref: ai_requests is partitioned (composite PK (id, created_at)), so it can't be FK'd by id alone.
  ai_request_id         uuid,
  ai_prompt_version_id  uuid references public.ai_prompt_versions (id) on delete set null,
  classification        public.lead_hunting_classification not null,
  lead_score            integer not null check (lead_score between 0 and 100),
  lead_quality          text,
  is_actual_lead        boolean not null default false,
  urgency               text,
  service_match         jsonb not null default '[]'::jsonb,
  reason_json           jsonb not null default '[]'::jsonb,
  recommended_action    text,
  created_at            timestamptz not null default now()
);

create index if not exists post_classifications_raw_post_idx
  on public.post_classifications (organization_id, raw_post_id, created_at desc);
create index if not exists post_classifications_type_idx
  on public.post_classifications (organization_id, classification, created_at desc);

create table if not exists public.archived_posts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  raw_post_id         uuid not null references public.raw_posts (id) on delete cascade,
  archive_category    public.archived_post_category not null,
  topic               text,
  summary             text,
  keywords            text[] not null default '{}'::text[],
  reason_for_archive  text,
  market_signal_score integer check (market_signal_score between 0 and 100),
  created_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create unique index if not exists archived_posts_one_live_per_raw_post_idx
  on public.archived_posts (raw_post_id)
  where deleted_at is null;
create index if not exists archived_posts_org_category_idx
  on public.archived_posts (organization_id, archive_category, created_at desc);

create table if not exists public.field_evidence_logs (
  id                bigint generated always as identity primary key,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  entity_type       text not null,
  entity_id         uuid not null,
  raw_post_id       uuid references public.raw_posts (id) on delete cascade,
  field_name        text not null,
  field_value       text,
  source_provider   text,
  source_type       text,
  source_url        text,
  confidence_score  numeric(5, 2),
  evidence_text     text,
  evidence_json     jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100))
);

create index if not exists field_evidence_logs_entity_idx
  on public.field_evidence_logs (organization_id, entity_type, entity_id, created_at desc);
create index if not exists field_evidence_logs_raw_post_idx
  on public.field_evidence_logs (organization_id, raw_post_id, created_at desc);
create index if not exists field_evidence_logs_field_idx
  on public.field_evidence_logs (organization_id, field_name, created_at desc);

-- ── RLS helpers ────────────────────────────────────────────────────────────────────────────────

create or replace function public.can_read_lead_hunting_capture(
  p_org uuid,
  p_captured_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_permission(p_org, 'discoveries.read')
    or (p_captured_by = auth.uid() and public.has_permission(p_org, 'discoveries.read_own'));
$$;

create or replace function public.can_read_lead_hunting_raw_post(p_raw_post uuid)
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

-- ── RLS — operator reads only; writes stay service-role / governed API for this phase ─────────

alter table public.lead_search_sessions enable row level security;
alter table public.raw_posts enable row level security;
alter table public.post_research_jobs enable row level security;
alter table public.post_research_reports enable row level security;
alter table public.post_classifications enable row level security;
alter table public.archived_posts enable row level security;
alter table public.field_evidence_logs enable row level security;

drop policy if exists lead_search_sessions_select_read on public.lead_search_sessions;
create policy lead_search_sessions_select_read on public.lead_search_sessions
  for select using (public.can_read_lead_hunting_capture(organization_id, captured_by_user_id));

drop policy if exists raw_posts_select_read on public.raw_posts;
create policy raw_posts_select_read on public.raw_posts
  for select using (public.can_read_lead_hunting_capture(organization_id, captured_by_user_id));

drop policy if exists post_research_jobs_select_read on public.post_research_jobs;
create policy post_research_jobs_select_read on public.post_research_jobs
  for select using (public.can_read_lead_hunting_raw_post(raw_post_id));

drop policy if exists post_research_reports_select_read on public.post_research_reports;
create policy post_research_reports_select_read on public.post_research_reports
  for select using (public.can_read_lead_hunting_raw_post(raw_post_id));

drop policy if exists post_classifications_select_read on public.post_classifications;
create policy post_classifications_select_read on public.post_classifications
  for select using (public.can_read_lead_hunting_raw_post(raw_post_id));

drop policy if exists archived_posts_select_read on public.archived_posts;
create policy archived_posts_select_read on public.archived_posts
  for select using (public.can_read_lead_hunting_raw_post(raw_post_id));

drop policy if exists field_evidence_logs_select_read on public.field_evidence_logs;
create policy field_evidence_logs_select_read on public.field_evidence_logs
  for select using (raw_post_id is not null and public.can_read_lead_hunting_raw_post(raw_post_id));
