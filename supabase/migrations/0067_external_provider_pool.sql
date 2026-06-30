-- Phase 10 · External research provider pool (P10-04).
-- Mirrors the AI pooled-key model for non-AI research vendors while keeping all writes
-- server-side/platform-governed for now.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'external_provider') then
    create type public.external_provider as enum (
      'bright_data',
      'apify',
      'people_data_labs',
      'tavily',
      'serpapi',
      'firecrawl',
      'scraperapi',
      'manual',
      'internal'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_provider_task_type') then
    create type public.external_provider_task_type as enum (
      'linkedin_post_lookup',
      'linkedin_profile_lookup',
      'linkedin_company_lookup',
      'person_enrichment',
      'company_enrichment',
      'website_discovery',
      'website_crawl',
      'email_discovery',
      'management_discovery',
      'country_resolution',
      'tech_stack_detection',
      'public_search'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_provider_account_type') then
    create type public.external_provider_account_type as enum ('free_tier', 'paid', 'byok', 'self_hosted');
  end if;

  if not exists (select 1 from pg_type where typname = 'external_provider_account_status') then
    create type public.external_provider_account_status as enum ('active', 'limited', 'disabled');
  end if;

  if not exists (select 1 from pg_type where typname = 'external_api_key_status') then
    create type public.external_api_key_status as enum (
      'active', 'limited', 'cooldown', 'exhausted', 'failed', 'revoked'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_provider_health_status') then
    create type public.external_provider_health_status as enum ('ok', 'degraded', 'down');
  end if;

  if not exists (select 1 from pg_type where typname = 'external_provider_limit_type') then
    create type public.external_provider_limit_type as enum ('rpm', 'tpm', 'daily', 'monthly');
  end if;
end
$$;

create table if not exists public.external_provider_accounts (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid references public.organizations (id) on delete cascade,
  provider                 public.external_provider not null,
  account_name             text not null,
  account_type             public.external_provider_account_type not null default 'paid',
  billing_owner            text,
  status                   public.external_provider_account_status not null default 'active',
  allowed_organization_ids uuid[] not null default '{}'::uuid[],
  monthly_budget           numeric(12, 6),
  monthly_usage            numeric(12, 6) not null default 0,
  rate_limit_rpm           integer,
  rate_limit_tpm           integer,
  base_url                 text,
  notes                    text,
  created_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (monthly_budget is null or monthly_budget >= 0),
  check (monthly_usage >= 0),
  check (rate_limit_rpm is null or rate_limit_rpm >= 0),
  check (rate_limit_tpm is null or rate_limit_tpm >= 0)
);

create index if not exists external_provider_accounts_provider_status_idx
  on public.external_provider_accounts (provider, status, created_at desc);
create index if not exists external_provider_accounts_org_provider_idx
  on public.external_provider_accounts (organization_id, provider, created_at desc);

drop trigger if exists external_provider_accounts_set_updated_at on public.external_provider_accounts;
create trigger external_provider_accounts_set_updated_at
  before update on public.external_provider_accounts
  for each row execute function public.set_updated_at();

create table if not exists public.external_api_keys (
  id                       uuid primary key default gen_random_uuid(),
  provider_account_id      uuid not null references public.external_provider_accounts (id) on delete cascade,
  provider                 public.external_provider not null,
  key_name                 text not null,
  encrypted_api_key        text not null,
  status                   public.external_api_key_status not null default 'active',
  environment              text not null default 'production',
  allowed_task_types       public.external_provider_task_type[] not null default '{}'::public.external_provider_task_type[],
  allowed_organization_ids uuid[] not null default '{}'::uuid[],
  daily_request_limit      integer,
  monthly_request_limit    bigint,
  monthly_cost_limit       numeric(12, 6),
  requests_used_today      integer not null default 0,
  requests_used_month      bigint not null default 0,
  cost_used_month          numeric(12, 6) not null default 0,
  last_used_at             timestamptz,
  last_error               text,
  cooldown_until           timestamptz,
  created_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  revoked_at               timestamptz,
  unique (provider_account_id, key_name),
  check (daily_request_limit is null or daily_request_limit >= 0),
  check (monthly_request_limit is null or monthly_request_limit >= 0),
  check (monthly_cost_limit is null or monthly_cost_limit >= 0),
  check (requests_used_today >= 0),
  check (requests_used_month >= 0),
  check (cost_used_month >= 0)
);

create index if not exists external_api_keys_provider_status_idx
  on public.external_api_keys (provider, status, cooldown_until, revoked_at);
create index if not exists external_api_keys_provider_account_status_idx
  on public.external_api_keys (provider_account_id, status, created_at desc);

drop trigger if exists external_api_keys_set_updated_at on public.external_api_keys;
create trigger external_api_keys_set_updated_at
  before update on public.external_api_keys
  for each row execute function public.set_updated_at();

create table if not exists public.external_provider_health_checks (
  id                  uuid primary key default gen_random_uuid(),
  provider            public.external_provider not null,
  provider_account_id uuid references public.external_provider_accounts (id) on delete cascade,
  api_key_id          uuid references public.external_api_keys (id) on delete cascade,
  status              public.external_provider_health_status not null,
  latency_ms          integer,
  checked_at          timestamptz not null default now(),
  detail              jsonb not null default '{}'::jsonb,
  check (latency_ms is null or latency_ms >= 0)
);

create index if not exists external_provider_health_checks_lookup_idx
  on public.external_provider_health_checks (provider, checked_at desc);
create index if not exists external_provider_health_checks_key_idx
  on public.external_provider_health_checks (api_key_id, checked_at desc);

alter table public.external_provider_accounts enable row level security;
alter table public.external_api_keys enable row level security;
alter table public.external_provider_health_checks enable row level security;

