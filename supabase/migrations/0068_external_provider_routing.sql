-- Phase 10 · External provider router + call ledger (P10-05).
-- Route selection, per-attempt call audit rows, usage events, and rate-limit persistence for the
-- non-AI research provider pool.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'external_call_status') then
    create type public.external_call_status as enum ('ok', 'error', 'fallback', 'rate_limited', 'cached');
  end if;
end
$$;

create table if not exists public.external_provider_routes (
  id                 uuid primary key default gen_random_uuid(),
  task_type          public.external_provider_task_type not null,
  primary_provider   public.external_provider not null,
  fallback_provider  public.external_provider,
  fallback_2_provider public.external_provider,
  allow_manual_fallback boolean not null default false,
  timeout_ms         integer,
  max_attempts       smallint not null default 3,
  is_active          boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (task_type),
  check (timeout_ms is null or timeout_ms > 0),
  check (max_attempts > 0)
);

create index if not exists external_provider_routes_active_idx
  on public.external_provider_routes (is_active, task_type);

drop trigger if exists external_provider_routes_set_updated_at on public.external_provider_routes;
create trigger external_provider_routes_set_updated_at
  before update on public.external_provider_routes
  for each row execute function public.set_updated_at();

create table if not exists public.external_provider_calls (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete cascade,
  user_id                   uuid references auth.users (id) on delete set null,
  task_type                 public.external_provider_task_type not null,
  external_provider_route_id uuid references public.external_provider_routes (id) on delete set null,
  provider                  public.external_provider not null,
  provider_account_id       uuid references public.external_provider_accounts (id) on delete set null,
  api_key_id                uuid references public.external_api_keys (id) on delete set null,
  raw_post_id               uuid references public.raw_posts (id) on delete set null,
  post_research_job_id      uuid references public.post_research_jobs (id) on delete set null,
  -- soft ref: job_runs is partitioned (composite PK (id, created_at)), so it can't be FK'd by id alone.
  job_run_id                uuid,
  status                    public.external_call_status not null default 'ok',
  attempt_number            integer not null default 1,
  latency_ms                integer,
  retry_after_seconds       integer,
  estimated_cost            numeric(12, 6) not null default 0,
  request_ref               jsonb not null default '{}'::jsonb,
  response_ref              jsonb not null default '{}'::jsonb,
  error                     text,
  started_at                timestamptz not null default now(),
  completed_at              timestamptz,
  created_at                timestamptz not null default now(),
  check (attempt_number > 0),
  check (latency_ms is null or latency_ms >= 0),
  check (retry_after_seconds is null or retry_after_seconds >= 0),
  check (estimated_cost >= 0)
);

create index if not exists external_provider_calls_org_task_idx
  on public.external_provider_calls (organization_id, task_type, created_at desc);
create index if not exists external_provider_calls_key_idx
  on public.external_provider_calls (api_key_id, created_at desc);
create index if not exists external_provider_calls_raw_post_idx
  on public.external_provider_calls (organization_id, raw_post_id, created_at desc);
create index if not exists external_provider_calls_job_run_idx
  on public.external_provider_calls (job_run_id);

create table if not exists public.external_usage_events (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete cascade,
  user_id                   uuid references auth.users (id) on delete set null,
  provider                  public.external_provider not null,
  task_type                 public.external_provider_task_type not null,
  external_provider_call_id uuid not null references public.external_provider_calls (id) on delete cascade,
  api_key_id                uuid references public.external_api_keys (id) on delete set null,
  provider_account_id       uuid references public.external_provider_accounts (id) on delete set null,
  requests_count            integer not null default 1,
  units_consumed            bigint not null default 0,
  estimated_cost            numeric(12, 6) not null default 0,
  status                    public.external_call_status not null default 'ok',
  created_at                timestamptz not null default now(),
  check (requests_count >= 0),
  check (units_consumed >= 0),
  check (estimated_cost >= 0)
);

create index if not exists external_usage_events_org_created_idx
  on public.external_usage_events (organization_id, created_at desc);
create index if not exists external_usage_events_org_user_created_idx
  on public.external_usage_events (organization_id, user_id, created_at desc);
create index if not exists external_usage_events_api_key_created_idx
  on public.external_usage_events (api_key_id, created_at desc);
create index if not exists external_usage_events_provider_task_created_idx
  on public.external_usage_events (provider, task_type, created_at desc);

create table if not exists public.external_provider_rate_limit_events (
  id                  uuid primary key default gen_random_uuid(),
  provider            public.external_provider not null,
  provider_account_id uuid references public.external_provider_accounts (id) on delete cascade,
  api_key_id          uuid references public.external_api_keys (id) on delete cascade,
  task_type           public.external_provider_task_type,
  limit_type          public.external_provider_limit_type not null,
  occurred_at         timestamptz not null default now(),
  retry_after_seconds integer,
  detail              jsonb not null default '{}'::jsonb,
  check (retry_after_seconds is null or retry_after_seconds >= 0)
);

create index if not exists external_provider_rate_limit_events_lookup_idx
  on public.external_provider_rate_limit_events (provider, occurred_at desc);
create index if not exists external_provider_rate_limit_events_key_idx
  on public.external_provider_rate_limit_events (api_key_id, occurred_at desc);

alter table public.external_provider_routes enable row level security;
alter table public.external_provider_calls enable row level security;
alter table public.external_usage_events enable row level security;
alter table public.external_provider_rate_limit_events enable row level security;

insert into public.external_provider_routes (
  task_type,
  primary_provider,
  fallback_provider,
  fallback_2_provider,
  allow_manual_fallback,
  timeout_ms,
  max_attempts,
  is_active,
  notes
)
values
  ('linkedin_post_lookup', 'bright_data', 'apify', 'manual', true, 45000, 3, true, 'Manual fallback may use the visible capture payload.'),
  ('linkedin_profile_lookup', 'bright_data', 'apify', 'people_data_labs', false, 45000, 3, true, null),
  ('linkedin_company_lookup', 'bright_data', 'apify', 'people_data_labs', false, 45000, 3, true, null),
  ('person_enrichment', 'people_data_labs', 'tavily', 'serpapi', false, 30000, 3, true, null),
  ('company_enrichment', 'people_data_labs', 'tavily', 'serpapi', false, 30000, 3, true, null),
  ('website_discovery', 'tavily', 'serpapi', 'manual', true, 30000, 3, true, null),
  ('website_crawl', 'firecrawl', 'scraperapi', 'internal', false, 45000, 3, true, 'Internal fallback is reserved for the future crawler worker.'),
  ('email_discovery', 'firecrawl', 'people_data_labs', 'manual', true, 30000, 3, true, null),
  ('management_discovery', 'firecrawl', 'people_data_labs', 'serpapi', false, 30000, 3, true, null),
  ('country_resolution', 'people_data_labs', 'tavily', 'serpapi', false, 30000, 3, true, null),
  ('tech_stack_detection', 'firecrawl', 'tavily', 'serpapi', false, 30000, 3, true, null),
  ('public_search', 'tavily', 'serpapi', 'manual', true, 30000, 3, true, null)
on conflict (task_type) do update
set
  primary_provider = excluded.primary_provider,
  fallback_provider = excluded.fallback_provider,
  fallback_2_provider = excluded.fallback_2_provider,
  allow_manual_fallback = excluded.allow_manual_fallback,
  timeout_ms = excluded.timeout_ms,
  max_attempts = excluded.max_attempts,
  is_active = excluded.is_active,
  notes = excluded.notes;

