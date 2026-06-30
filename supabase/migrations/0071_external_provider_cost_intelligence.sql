-- Phase 10 · External Provider Free-Tier & Cost Intelligence (P10-13).
-- Extends the existing Provider Capacity Pool with configurable plan profiles,
-- reservation-backed usage metering, renewal snapshots, alerts, reconciliations,
-- and test-flow governance without exposing provider secrets.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'external_provider_plan_type') then
    create type public.external_provider_plan_type as enum ('free', 'trial', 'paid', 'custom');
  end if;

  if not exists (select 1 from pg_type where typname = 'external_provider_unit_type') then
    create type public.external_provider_unit_type as enum (
      'request',
      'record',
      'credit',
      'usd_credit',
      'search',
      'page',
      'token',
      'compute_unit',
      'api_credit'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_provider_renewal_interval') then
    create type public.external_provider_renewal_interval as enum (
      'daily',
      'weekly',
      'monthly',
      'yearly',
      'trial',
      'custom',
      'manual'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_usage_reservation_status') then
    create type public.external_usage_reservation_status as enum (
      'reserved',
      'settled',
      'released',
      'expired'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_usage_snapshot_period_type') then
    create type public.external_usage_snapshot_period_type as enum (
      'daily',
      'weekly',
      'monthly',
      'trial',
      'custom'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_alert_type') then
    create type public.external_alert_type as enum (
      'info',
      'warning',
      'high',
      'critical',
      'exhausted',
      'projected_exhaustion',
      'trial_expiry',
      'fallback_started',
      'paid_cost_risk',
      'variance_detected',
      'renewed',
      'all_keys_exhausted'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_alert_status') then
    create type public.external_alert_status as enum (
      'new',
      'sent',
      'acknowledged',
      'resolved'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_provider_test_status') then
    create type public.external_provider_test_status as enum (
      'queued',
      'running',
      'passed',
      'failed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_usage_reconciliation_status') then
    create type public.external_usage_reconciliation_status as enum (
      'pending',
      'matched',
      'variance_detected',
      'manually_adjusted',
      'unsupported'
    );
  end if;
end
$$;

alter type public.external_provider_account_type add value if not exists 'trial';
alter type public.external_provider_account_type add value if not exists 'internal';

alter type public.external_provider_account_status add value if not exists 'expired';
alter type public.external_provider_account_status add value if not exists 'suspended';

alter type public.external_api_key_status add value if not exists 'expired';

alter type public.external_provider_limit_type add value if not exists 'weekly';

alter type public.external_provider_task_type add value if not exists 'blocked_website_fetch';
alter type public.external_provider_task_type add value if not exists 'provider_health_check';
alter type public.external_provider_task_type add value if not exists 'provider_test_flow';

alter type public.external_call_status add value if not exists 'success';
alter type public.external_call_status add value if not exists 'failed';
alter type public.external_call_status add value if not exists 'skipped_cache';
alter type public.external_call_status add value if not exists 'test_success';
alter type public.external_call_status add value if not exists 'test_failed';

create table if not exists public.external_provider_plan_profiles (
  id                           uuid primary key default gen_random_uuid(),
  provider                     public.external_provider not null,
  plan_name                    text not null,
  plan_type                    public.external_provider_plan_type not null default 'custom',
  unit_type                    public.external_provider_unit_type not null,
  free_entitlement_amount      numeric(14, 4) not null default 0,
  included_units               numeric(14, 4) not null default 0,
  renewal_interval             public.external_provider_renewal_interval not null default 'monthly',
  renewal_timezone             text not null default 'UTC',
  renewal_anchor_day           text,
  trial_starts_at              timestamptz,
  trial_ends_at                timestamptz,
  overage_enabled              boolean not null default false,
  overage_unit_price           numeric(12, 6) not null default 0,
  currency                     char(3) not null default 'USD',
  cost_rules                   jsonb not null default '{}'::jsonb,
  provider_dashboard_url       text,
  test_enabled                 boolean not null default false,
  test_task_type               public.external_provider_task_type,
  test_payload_json            jsonb not null default '{}'::jsonb,
  test_consumes_credits        boolean not null default false,
  expected_response_shape_json jsonb not null default '{}'::jsonb,
  notes                        text,
  is_active                    boolean not null default true,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (provider, plan_name),
  check (free_entitlement_amount >= 0),
  check (included_units >= 0),
  check (overage_unit_price >= 0)
);

create index if not exists external_provider_plan_profiles_provider_active_idx
  on public.external_provider_plan_profiles (provider, is_active, plan_name);

drop trigger if exists external_provider_plan_profiles_set_updated_at on public.external_provider_plan_profiles;
create trigger external_provider_plan_profiles_set_updated_at
  before update on public.external_provider_plan_profiles
  for each row execute function public.set_updated_at();

alter table public.external_provider_accounts
  add column if not exists plan_profile_id uuid references public.external_provider_plan_profiles (id) on delete set null,
  add column if not exists weekly_budget numeric(12, 6),
  add column if not exists total_budget numeric(12, 6),
  add column if not exists weekly_usage numeric(12, 6) not null default 0,
  add column if not exists total_usage numeric(12, 6) not null default 0;

alter table public.external_provider_accounts
  alter column account_type set default 'paid',
  alter column status set default 'active';

alter table public.external_provider_accounts
  drop constraint if exists external_provider_accounts_weekly_budget_check,
  add constraint external_provider_accounts_weekly_budget_check check (weekly_budget is null or weekly_budget >= 0);

alter table public.external_provider_accounts
  drop constraint if exists external_provider_accounts_total_budget_check,
  add constraint external_provider_accounts_total_budget_check check (total_budget is null or total_budget >= 0);

alter table public.external_provider_accounts
  drop constraint if exists external_provider_accounts_weekly_usage_check,
  add constraint external_provider_accounts_weekly_usage_check check (weekly_usage >= 0);

alter table public.external_provider_accounts
  drop constraint if exists external_provider_accounts_total_usage_check,
  add constraint external_provider_accounts_total_usage_check check (total_usage >= 0);

alter table public.external_api_keys
  add column if not exists masked_key_preview text,
  add column if not exists priority integer not null default 100,
  add column if not exists weekly_request_limit bigint,
  add column if not exists daily_credit_limit numeric(14, 4),
  add column if not exists weekly_credit_limit numeric(14, 4),
  add column if not exists monthly_credit_limit numeric(14, 4),
  add column if not exists daily_record_limit bigint,
  add column if not exists weekly_record_limit bigint,
  add column if not exists monthly_record_limit bigint,
  add column if not exists daily_cost_limit numeric(12, 6),
  add column if not exists weekly_cost_limit numeric(12, 6),
  add column if not exists requests_used_week bigint not null default 0,
  add column if not exists units_used_today numeric(14, 4) not null default 0,
  add column if not exists units_used_week numeric(14, 4) not null default 0,
  add column if not exists units_used_month numeric(14, 4) not null default 0,
  add column if not exists records_used_today bigint not null default 0,
  add column if not exists records_used_week bigint not null default 0,
  add column if not exists records_used_month bigint not null default 0,
  add column if not exists credits_used_today numeric(14, 4) not null default 0,
  add column if not exists credits_used_week numeric(14, 4) not null default 0,
  add column if not exists credits_used_month numeric(14, 4) not null default 0,
  add column if not exists cost_used_today numeric(12, 6) not null default 0,
  add column if not exists cost_used_week numeric(12, 6) not null default 0,
  add column if not exists reset_daily_at timestamptz,
  add column if not exists reset_weekly_at timestamptz,
  add column if not exists reset_monthly_at timestamptz,
  add column if not exists reserved_requests_active bigint not null default 0,
  add column if not exists reserved_records_active bigint not null default 0,
  add column if not exists reserved_credits_active numeric(14, 4) not null default 0,
  add column if not exists reserved_units_active numeric(14, 4) not null default 0,
  add column if not exists reserved_cost_active numeric(12, 6) not null default 0;

alter table public.external_api_keys
  alter column status set default 'active';

alter table public.external_api_keys
  drop constraint if exists external_api_keys_priority_check,
  add constraint external_api_keys_priority_check check (priority >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_weekly_request_limit_check,
  add constraint external_api_keys_weekly_request_limit_check check (weekly_request_limit is null or weekly_request_limit >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_daily_credit_limit_check,
  add constraint external_api_keys_daily_credit_limit_check check (daily_credit_limit is null or daily_credit_limit >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_weekly_credit_limit_check,
  add constraint external_api_keys_weekly_credit_limit_check check (weekly_credit_limit is null or weekly_credit_limit >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_monthly_credit_limit_check,
  add constraint external_api_keys_monthly_credit_limit_check check (monthly_credit_limit is null or monthly_credit_limit >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_daily_record_limit_check,
  add constraint external_api_keys_daily_record_limit_check check (daily_record_limit is null or daily_record_limit >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_weekly_record_limit_check,
  add constraint external_api_keys_weekly_record_limit_check check (weekly_record_limit is null or weekly_record_limit >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_monthly_record_limit_check,
  add constraint external_api_keys_monthly_record_limit_check check (monthly_record_limit is null or monthly_record_limit >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_daily_cost_limit_check,
  add constraint external_api_keys_daily_cost_limit_check check (daily_cost_limit is null or daily_cost_limit >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_weekly_cost_limit_check,
  add constraint external_api_keys_weekly_cost_limit_check check (weekly_cost_limit is null or weekly_cost_limit >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_requests_used_week_check,
  add constraint external_api_keys_requests_used_week_check check (requests_used_week >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_units_used_today_check,
  add constraint external_api_keys_units_used_today_check check (units_used_today >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_units_used_week_check,
  add constraint external_api_keys_units_used_week_check check (units_used_week >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_units_used_month_check,
  add constraint external_api_keys_units_used_month_check check (units_used_month >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_records_used_today_check,
  add constraint external_api_keys_records_used_today_check check (records_used_today >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_records_used_week_check,
  add constraint external_api_keys_records_used_week_check check (records_used_week >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_records_used_month_check,
  add constraint external_api_keys_records_used_month_check check (records_used_month >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_credits_used_today_check,
  add constraint external_api_keys_credits_used_today_check check (credits_used_today >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_credits_used_week_check,
  add constraint external_api_keys_credits_used_week_check check (credits_used_week >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_credits_used_month_check,
  add constraint external_api_keys_credits_used_month_check check (credits_used_month >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_cost_used_today_check,
  add constraint external_api_keys_cost_used_today_check check (cost_used_today >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_cost_used_week_check,
  add constraint external_api_keys_cost_used_week_check check (cost_used_week >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_reserved_requests_active_check,
  add constraint external_api_keys_reserved_requests_active_check check (reserved_requests_active >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_reserved_records_active_check,
  add constraint external_api_keys_reserved_records_active_check check (reserved_records_active >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_reserved_credits_active_check,
  add constraint external_api_keys_reserved_credits_active_check check (reserved_credits_active >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_reserved_units_active_check,
  add constraint external_api_keys_reserved_units_active_check check (reserved_units_active >= 0);

alter table public.external_api_keys
  drop constraint if exists external_api_keys_reserved_cost_active_check,
  add constraint external_api_keys_reserved_cost_active_check check (reserved_cost_active >= 0);

update public.external_api_keys
set
  masked_key_preview = coalesce(masked_key_preview, 'stored-secret'),
  reset_daily_at = coalesce(reset_daily_at, date_trunc('day', now()) + interval '1 day'),
  reset_weekly_at = coalesce(reset_weekly_at, date_trunc('week', now()) + interval '1 week'),
  reset_monthly_at = coalesce(reset_monthly_at, date_trunc('month', now()) + interval '1 month')
where masked_key_preview is null
   or reset_daily_at is null
   or reset_weekly_at is null
   or reset_monthly_at is null;

create index if not exists external_api_keys_status_priority_idx
  on public.external_api_keys (provider, status, priority, cooldown_until, last_used_at);

alter table public.external_provider_routes
  add column if not exists fallback_3_provider public.external_provider,
  add column if not exists requires_browser boolean not null default false,
  add column if not exists requires_json boolean not null default false;

alter table public.external_provider_calls
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists search_session_id uuid references public.lead_search_sessions (id) on delete set null,
  add column if not exists provider_request_id text,
  add column if not exists request_hash text,
  add column if not exists response_summary jsonb not null default '{}'::jsonb,
  add column if not exists error_code text;

create index if not exists external_provider_calls_request_hash_idx
  on public.external_provider_calls (task_type, request_hash, created_at desc)
  where request_hash is not null;

alter table public.external_usage_events
  alter column units_consumed type numeric(14, 4) using units_consumed::numeric(14, 4);

alter table public.external_usage_events
  add column if not exists organization_source_id uuid,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists search_session_id uuid references public.lead_search_sessions (id) on delete set null,
  add column if not exists raw_post_id uuid references public.raw_posts (id) on delete set null,
  add column if not exists job_run_id uuid,
  add column if not exists request_hash text,
  add column if not exists provider_request_id text,
  add column if not exists response_summary jsonb not null default '{}'::jsonb,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists unit_type public.external_provider_unit_type,
  add column if not exists record_count bigint not null default 0,
  add column if not exists page_count bigint not null default 0,
  add column if not exists search_count bigint not null default 0,
  add column if not exists credit_cost numeric(14, 4) not null default 0,
  add column if not exists usd_credit_cost numeric(12, 6) not null default 0,
  add column if not exists free_units_applied numeric(14, 4) not null default 0,
  add column if not exists paid_units_applied numeric(14, 4) not null default 0,
  add column if not exists paid_cost_usd numeric(12, 6) not null default 0;

create index if not exists external_usage_events_search_session_idx
  on public.external_usage_events (search_session_id, created_at desc)
  where search_session_id is not null;

create index if not exists external_usage_events_request_hash_idx
  on public.external_usage_events (provider, task_type, request_hash, created_at desc)
  where request_hash is not null;

create table if not exists public.external_usage_reservations (
  id                         uuid primary key default gen_random_uuid(),
  provider                   public.external_provider not null,
  provider_account_id        uuid references public.external_provider_accounts (id) on delete cascade,
  api_key_id                 uuid references public.external_api_keys (id) on delete cascade,
  task_type                  public.external_provider_task_type not null,
  entity_type                text,
  entity_id                  uuid,
  request_hash               text,
  input_summary              jsonb not null default '{}'::jsonb,
  reserved_request_count     integer not null default 1,
  reserved_record_count      bigint not null default 0,
  reserved_page_count        bigint not null default 0,
  reserved_search_count      bigint not null default 0,
  reserved_credit_cost       numeric(14, 4) not null default 0,
  reserved_usd_credit_cost   numeric(12, 6) not null default 0,
  reserved_units             numeric(14, 4) not null default 0,
  reserved_cost_usd          numeric(12, 6) not null default 0,
  status                     public.external_usage_reservation_status not null default 'reserved',
  expires_at                 timestamptz not null,
  settled_usage_event_id     uuid references public.external_usage_events (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (reserved_request_count >= 0),
  check (reserved_record_count >= 0),
  check (reserved_page_count >= 0),
  check (reserved_search_count >= 0),
  check (reserved_credit_cost >= 0),
  check (reserved_usd_credit_cost >= 0),
  check (reserved_units >= 0),
  check (reserved_cost_usd >= 0)
);

create index if not exists external_usage_reservations_key_status_idx
  on public.external_usage_reservations (api_key_id, status, expires_at);
create index if not exists external_usage_reservations_request_hash_idx
  on public.external_usage_reservations (request_hash, status)
  where request_hash is not null;

drop trigger if exists external_usage_reservations_set_updated_at on public.external_usage_reservations;
create trigger external_usage_reservations_set_updated_at
  before update on public.external_usage_reservations
  for each row execute function public.set_updated_at();

create table if not exists public.external_usage_snapshots (
  id                        uuid primary key default gen_random_uuid(),
  provider                  public.external_provider not null,
  provider_account_id       uuid references public.external_provider_accounts (id) on delete cascade,
  api_key_id                uuid references public.external_api_keys (id) on delete cascade,
  period_type               public.external_usage_snapshot_period_type not null,
  period_start              timestamptz not null,
  period_end                timestamptz not null,
  unit_type                 public.external_provider_unit_type not null,
  entitlement_units         numeric(14, 4) not null default 0,
  used_units                numeric(14, 4) not null default 0,
  remaining_units           numeric(14, 4) not null default 0,
  usage_percent             numeric(6, 2) not null default 0,
  estimated_paid_cost_usd   numeric(12, 6) not null default 0,
  projected_exhaustion_at   timestamptz,
  projected_period_cost_usd numeric(12, 6) not null default 0,
  usage_velocity_per_day    numeric(14, 4) not null default 0,
  is_estimated              boolean not null default true,
  calculated_at             timestamptz not null default now(),
  unique (provider, provider_account_id, api_key_id, period_type, period_start, period_end)
);

create index if not exists external_usage_snapshots_lookup_idx
  on public.external_usage_snapshots (provider, calculated_at desc);

create table if not exists public.external_alert_rules (
  id                     uuid primary key default gen_random_uuid(),
  provider               public.external_provider,
  api_key_id             uuid references public.external_api_keys (id) on delete cascade,
  threshold_percent      numeric(5, 2),
  alert_type             public.external_alert_type not null,
  notify_master_admin    boolean not null default true,
  notify_company_admin   boolean not null default false,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  check (threshold_percent is null or (threshold_percent >= 0 and threshold_percent <= 100))
);

create index if not exists external_alert_rules_lookup_idx
  on public.external_alert_rules (is_active, alert_type, provider);

create table if not exists public.external_alert_events (
  id                  uuid primary key default gen_random_uuid(),
  provider            public.external_provider not null,
  provider_account_id uuid references public.external_provider_accounts (id) on delete cascade,
  api_key_id          uuid references public.external_api_keys (id) on delete cascade,
  alert_rule_id       uuid references public.external_alert_rules (id) on delete set null,
  alert_type          public.external_alert_type not null,
  threshold_percent   numeric(5, 2),
  dedupe_key          text,
  message             text not null,
  data                jsonb not null default '{}'::jsonb,
  status              public.external_alert_status not null default 'new',
  created_at          timestamptz not null default now(),
  acknowledged_by     uuid references auth.users (id) on delete set null,
  acknowledged_at     timestamptz,
  unique (dedupe_key)
);

create index if not exists external_alert_events_status_idx
  on public.external_alert_events (status, created_at desc);

create table if not exists public.external_provider_test_runs (
  id                           uuid primary key default gen_random_uuid(),
  provider                     public.external_provider not null,
  provider_account_id          uuid references public.external_provider_accounts (id) on delete cascade,
  api_key_id                   uuid references public.external_api_keys (id) on delete cascade,
  task_type                    public.external_provider_task_type not null,
  test_name                    text not null,
  status                       public.external_provider_test_status not null default 'queued',
  request_payload              jsonb not null default '{}'::jsonb,
  response_summary             jsonb not null default '{}'::jsonb,
  latency_ms                   integer,
  estimated_units_used         numeric(14, 4) not null default 0,
  estimated_cost_usd           numeric(12, 6) not null default 0,
  error_code                   text,
  error_message                text,
  job_run_id                   uuid,
  created_by                   uuid references auth.users (id) on delete set null,
  created_at                   timestamptz not null default now(),
  completed_at                 timestamptz,
  check (latency_ms is null or latency_ms >= 0),
  check (estimated_units_used >= 0),
  check (estimated_cost_usd >= 0)
);

create index if not exists external_provider_test_runs_lookup_idx
  on public.external_provider_test_runs (api_key_id, created_at desc);

create table if not exists public.external_usage_reconciliations (
  id                       uuid primary key default gen_random_uuid(),
  provider                 public.external_provider not null,
  provider_account_id      uuid references public.external_provider_accounts (id) on delete cascade,
  api_key_id               uuid references public.external_api_keys (id) on delete cascade,
  period_start             timestamptz not null,
  period_end               timestamptz not null,
  internal_used_units      numeric(14, 4) not null default 0,
  provider_reported_units  numeric(14, 4),
  variance_units           numeric(14, 4),
  variance_percent         numeric(8, 4),
  status                   public.external_usage_reconciliation_status not null default 'pending',
  raw_summary              jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now()
);

create index if not exists external_usage_reconciliations_lookup_idx
  on public.external_usage_reconciliations (provider, created_at desc);

create table if not exists public.external_provider_cache_entries (
  id                  uuid primary key default gen_random_uuid(),
  provider            public.external_provider not null,
  task_type           public.external_provider_task_type not null,
  cache_key           text not null,
  response_summary    jsonb not null default '{}'::jsonb,
  normalized_data     jsonb not null default '{}'::jsonb,
  units_consumed      numeric(14, 4) not null default 0,
  estimated_cost_usd  numeric(12, 6) not null default 0,
  source_provider     public.external_provider not null,
  confidence_score    numeric(6, 2),
  entity_type         text,
  entity_id           uuid,
  cached_at           timestamptz not null default now(),
  expires_at          timestamptz not null,
  last_hit_at         timestamptz,
  hit_count           integer not null default 0,
  unique (cache_key),
  check (units_consumed >= 0),
  check (estimated_cost_usd >= 0),
  check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100)),
  check (hit_count >= 0)
);

create index if not exists external_provider_cache_entries_lookup_idx
  on public.external_provider_cache_entries (task_type, expires_at desc);

alter table public.external_provider_plan_profiles enable row level security;
alter table public.external_usage_reservations enable row level security;
alter table public.external_usage_snapshots enable row level security;
alter table public.external_alert_rules enable row level security;
alter table public.external_alert_events enable row level security;
alter table public.external_provider_test_runs enable row level security;
alter table public.external_usage_reconciliations enable row level security;
alter table public.external_provider_cache_entries enable row level security;

drop policy if exists external_usage_snapshots_usage_read on public.external_usage_snapshots;
create policy external_usage_snapshots_usage_read on public.external_usage_snapshots
  for select using (
    provider_account_id is not null
    and exists (
      select 1
      from public.external_provider_accounts epa
      where epa.id = provider_account_id
        and epa.organization_id is not null
        and public.has_permission(epa.organization_id, 'external_providers.usage.read')
    )
  );

drop policy if exists external_alert_events_provider_read on public.external_alert_events;
create policy external_alert_events_provider_read on public.external_alert_events
  for select using (
    provider_account_id is not null
    and exists (
      select 1
      from public.external_provider_accounts epa
      where epa.id = provider_account_id
        and epa.organization_id is not null
        and public.has_permission(epa.organization_id, 'external_providers.read')
    )
  );

create or replace function public.reserve_external_provider_usage(
  p_provider public.external_provider,
  p_provider_account_id uuid,
  p_api_key_id uuid,
  p_task_type public.external_provider_task_type,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_request_hash text default null,
  p_input_summary jsonb default '{}'::jsonb,
  p_reserved_request_count integer default 1,
  p_reserved_record_count bigint default 0,
  p_reserved_page_count bigint default 0,
  p_reserved_search_count bigint default 0,
  p_reserved_credit_cost numeric default 0,
  p_reserved_usd_credit_cost numeric default 0,
  p_reserved_units numeric default 0,
  p_reserved_cost_usd numeric default 0,
  p_expires_at timestamptz default (now() + interval '15 minutes')
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key public.external_api_keys%rowtype;
  v_account public.external_provider_accounts%rowtype;
  v_reservation_id uuid := gen_random_uuid();
begin
  select * into v_key
  from public.external_api_keys
  where id = p_api_key_id
  for update;

  if not found then
    raise exception 'external_api_key_not_found';
  end if;

  select * into v_account
  from public.external_provider_accounts
  where id = p_provider_account_id
  for update;

  if not found then
    raise exception 'external_provider_account_not_found';
  end if;

  if v_key.provider <> p_provider or v_account.provider <> p_provider then
    raise exception 'external_provider_mismatch';
  end if;

  if v_key.status <> 'active' then
    raise exception 'external_api_key_unavailable';
  end if;

  if v_account.status not in ('active', 'limited') then
    raise exception 'external_provider_account_unavailable';
  end if;

  if v_key.cooldown_until is not null and v_key.cooldown_until > now() then
    raise exception 'external_api_key_cooling_down';
  end if;

  if v_key.daily_request_limit is not null
     and coalesce(v_key.requests_used_today, 0) + coalesce(v_key.reserved_requests_active, 0) + coalesce(p_reserved_request_count, 0) > v_key.daily_request_limit then
    raise exception 'external_api_key_daily_request_limit';
  end if;

  if v_key.weekly_request_limit is not null
     and coalesce(v_key.requests_used_week, 0) + coalesce(v_key.reserved_requests_active, 0) + coalesce(p_reserved_request_count, 0) > v_key.weekly_request_limit then
    raise exception 'external_api_key_weekly_request_limit';
  end if;

  if v_key.monthly_request_limit is not null
     and coalesce(v_key.requests_used_month, 0) + coalesce(v_key.reserved_requests_active, 0) + coalesce(p_reserved_request_count, 0) > v_key.monthly_request_limit then
    raise exception 'external_api_key_monthly_request_limit';
  end if;

  if v_key.daily_record_limit is not null
     and coalesce(v_key.records_used_today, 0) + coalesce(v_key.reserved_records_active, 0) + coalesce(p_reserved_record_count, 0) > v_key.daily_record_limit then
    raise exception 'external_api_key_daily_record_limit';
  end if;

  if v_key.weekly_record_limit is not null
     and coalesce(v_key.records_used_week, 0) + coalesce(v_key.reserved_records_active, 0) + coalesce(p_reserved_record_count, 0) > v_key.weekly_record_limit then
    raise exception 'external_api_key_weekly_record_limit';
  end if;

  if v_key.monthly_record_limit is not null
     and coalesce(v_key.records_used_month, 0) + coalesce(v_key.reserved_records_active, 0) + coalesce(p_reserved_record_count, 0) > v_key.monthly_record_limit then
    raise exception 'external_api_key_monthly_record_limit';
  end if;

  if v_key.daily_credit_limit is not null
     and coalesce(v_key.credits_used_today, 0) + coalesce(v_key.reserved_credits_active, 0) + coalesce(p_reserved_credit_cost, 0) > v_key.daily_credit_limit then
    raise exception 'external_api_key_daily_credit_limit';
  end if;

  if v_key.weekly_credit_limit is not null
     and coalesce(v_key.credits_used_week, 0) + coalesce(v_key.reserved_credits_active, 0) + coalesce(p_reserved_credit_cost, 0) > v_key.weekly_credit_limit then
    raise exception 'external_api_key_weekly_credit_limit';
  end if;

  if v_key.monthly_credit_limit is not null
     and coalesce(v_key.credits_used_month, 0) + coalesce(v_key.reserved_credits_active, 0) + coalesce(p_reserved_credit_cost, 0) > v_key.monthly_credit_limit then
    raise exception 'external_api_key_monthly_credit_limit';
  end if;

  if v_key.daily_cost_limit is not null
     and coalesce(v_key.cost_used_today, 0) + coalesce(v_key.reserved_cost_active, 0) + coalesce(p_reserved_cost_usd, 0) > v_key.daily_cost_limit then
    raise exception 'external_api_key_daily_cost_limit';
  end if;

  if v_key.weekly_cost_limit is not null
     and coalesce(v_key.cost_used_week, 0) + coalesce(v_key.reserved_cost_active, 0) + coalesce(p_reserved_cost_usd, 0) > v_key.weekly_cost_limit then
    raise exception 'external_api_key_weekly_cost_limit';
  end if;

  if v_key.monthly_cost_limit is not null
     and coalesce(v_key.cost_used_month, 0) + coalesce(v_key.reserved_cost_active, 0) + coalesce(p_reserved_cost_usd, 0) > v_key.monthly_cost_limit then
    raise exception 'external_api_key_monthly_cost_limit';
  end if;

  if v_account.weekly_budget is not null
     and coalesce(v_account.weekly_usage, 0) + coalesce(p_reserved_cost_usd, 0) > v_account.weekly_budget then
    raise exception 'external_provider_account_weekly_budget';
  end if;

  if v_account.monthly_budget is not null
     and coalesce(v_account.monthly_usage, 0) + coalesce(p_reserved_cost_usd, 0) > v_account.monthly_budget then
    raise exception 'external_provider_account_monthly_budget';
  end if;

  if v_account.total_budget is not null
     and coalesce(v_account.total_usage, 0) + coalesce(p_reserved_cost_usd, 0) > v_account.total_budget then
    raise exception 'external_provider_account_total_budget';
  end if;

  update public.external_api_keys
  set
    reserved_requests_active = coalesce(reserved_requests_active, 0) + coalesce(p_reserved_request_count, 0),
    reserved_records_active = coalesce(reserved_records_active, 0) + coalesce(p_reserved_record_count, 0),
    reserved_credits_active = coalesce(reserved_credits_active, 0) + coalesce(p_reserved_credit_cost, 0),
    reserved_units_active = coalesce(reserved_units_active, 0) + coalesce(p_reserved_units, 0),
    reserved_cost_active = coalesce(reserved_cost_active, 0) + coalesce(p_reserved_cost_usd, 0),
    updated_at = now()
  where id = p_api_key_id;

  insert into public.external_usage_reservations (
    id,
    provider,
    provider_account_id,
    api_key_id,
    task_type,
    entity_type,
    entity_id,
    request_hash,
    input_summary,
    reserved_request_count,
    reserved_record_count,
    reserved_page_count,
    reserved_search_count,
    reserved_credit_cost,
    reserved_usd_credit_cost,
    reserved_units,
    reserved_cost_usd,
    status,
    expires_at
  )
  values (
    v_reservation_id,
    p_provider,
    p_provider_account_id,
    p_api_key_id,
    p_task_type,
    p_entity_type,
    p_entity_id,
    p_request_hash,
    coalesce(p_input_summary, '{}'::jsonb),
    coalesce(p_reserved_request_count, 0),
    coalesce(p_reserved_record_count, 0),
    coalesce(p_reserved_page_count, 0),
    coalesce(p_reserved_search_count, 0),
    coalesce(p_reserved_credit_cost, 0),
    coalesce(p_reserved_usd_credit_cost, 0),
    coalesce(p_reserved_units, 0),
    coalesce(p_reserved_cost_usd, 0),
    'reserved',
    p_expires_at
  );

  return v_reservation_id;
end;
$$;

create or replace function public.release_external_provider_reservation(
  p_reservation_id uuid,
  p_status public.external_usage_reservation_status default 'released'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.external_usage_reservations%rowtype;
begin
  select * into v_reservation
  from public.external_usage_reservations
  where id = p_reservation_id
  for update;

  if not found then
    return;
  end if;

  if v_reservation.status <> 'reserved' then
    return;
  end if;

  update public.external_api_keys
  set
    reserved_requests_active = greatest(0, coalesce(reserved_requests_active, 0) - coalesce(v_reservation.reserved_request_count, 0)),
    reserved_records_active = greatest(0, coalesce(reserved_records_active, 0) - coalesce(v_reservation.reserved_record_count, 0)),
    reserved_credits_active = greatest(0, coalesce(reserved_credits_active, 0) - coalesce(v_reservation.reserved_credit_cost, 0)),
    reserved_units_active = greatest(0, coalesce(reserved_units_active, 0) - coalesce(v_reservation.reserved_units, 0)),
    reserved_cost_active = greatest(0, coalesce(reserved_cost_active, 0) - coalesce(v_reservation.reserved_cost_usd, 0)),
    updated_at = now()
  where id = v_reservation.api_key_id;

  update public.external_usage_reservations
  set
    status = p_status,
    updated_at = now()
  where id = p_reservation_id;
end;
$$;

create or replace function public.settle_external_provider_reservation(
  p_reservation_id uuid,
  p_usage_event_id uuid,
  p_status public.external_call_status,
  p_actual_request_count integer default 0,
  p_actual_record_count bigint default 0,
  p_actual_credit_cost numeric default 0,
  p_actual_units numeric default 0,
  p_actual_cost_usd numeric default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.external_usage_reservations%rowtype;
  v_next_status public.external_api_key_status;
begin
  select * into v_reservation
  from public.external_usage_reservations
  where id = p_reservation_id
  for update;

  if not found then
    return;
  end if;

  if v_reservation.status <> 'reserved' then
    return;
  end if;

  update public.external_api_keys
  set
    reserved_requests_active = greatest(0, coalesce(reserved_requests_active, 0) - coalesce(v_reservation.reserved_request_count, 0)),
    reserved_records_active = greatest(0, coalesce(reserved_records_active, 0) - coalesce(v_reservation.reserved_record_count, 0)),
    reserved_credits_active = greatest(0, coalesce(reserved_credits_active, 0) - coalesce(v_reservation.reserved_credit_cost, 0)),
    reserved_units_active = greatest(0, coalesce(reserved_units_active, 0) - coalesce(v_reservation.reserved_units, 0)),
    reserved_cost_active = greatest(0, coalesce(reserved_cost_active, 0) - coalesce(v_reservation.reserved_cost_usd, 0)),
    requests_used_today = coalesce(requests_used_today, 0) + coalesce(p_actual_request_count, 0),
    requests_used_week = coalesce(requests_used_week, 0) + coalesce(p_actual_request_count, 0),
    requests_used_month = coalesce(requests_used_month, 0) + coalesce(p_actual_request_count, 0),
    units_used_today = coalesce(units_used_today, 0) + coalesce(p_actual_units, 0),
    units_used_week = coalesce(units_used_week, 0) + coalesce(p_actual_units, 0),
    units_used_month = coalesce(units_used_month, 0) + coalesce(p_actual_units, 0),
    records_used_today = coalesce(records_used_today, 0) + coalesce(p_actual_record_count, 0),
    records_used_week = coalesce(records_used_week, 0) + coalesce(p_actual_record_count, 0),
    records_used_month = coalesce(records_used_month, 0) + coalesce(p_actual_record_count, 0),
    credits_used_today = coalesce(credits_used_today, 0) + coalesce(p_actual_credit_cost, 0),
    credits_used_week = coalesce(credits_used_week, 0) + coalesce(p_actual_credit_cost, 0),
    credits_used_month = coalesce(credits_used_month, 0) + coalesce(p_actual_credit_cost, 0),
    cost_used_today = coalesce(cost_used_today, 0) + coalesce(p_actual_cost_usd, 0),
    cost_used_week = coalesce(cost_used_week, 0) + coalesce(p_actual_cost_usd, 0),
    cost_used_month = coalesce(cost_used_month, 0) + coalesce(p_actual_cost_usd, 0),
    last_used_at = now(),
    last_error = case when p_status in ('error', 'failed', 'test_failed') then coalesce(last_error, 'external provider failure') else null end,
    status = case
      when status in ('revoked', 'failed', 'expired') then status
      when monthly_request_limit is not null and coalesce(requests_used_month, 0) + coalesce(p_actual_request_count, 0) >= monthly_request_limit then 'exhausted'
      when weekly_request_limit is not null and coalesce(requests_used_week, 0) + coalesce(p_actual_request_count, 0) >= weekly_request_limit then 'exhausted'
      when daily_request_limit is not null and coalesce(requests_used_today, 0) + coalesce(p_actual_request_count, 0) >= daily_request_limit then 'exhausted'
      when monthly_record_limit is not null and coalesce(records_used_month, 0) + coalesce(p_actual_record_count, 0) >= monthly_record_limit then 'exhausted'
      when weekly_record_limit is not null and coalesce(records_used_week, 0) + coalesce(p_actual_record_count, 0) >= weekly_record_limit then 'exhausted'
      when daily_record_limit is not null and coalesce(records_used_today, 0) + coalesce(p_actual_record_count, 0) >= daily_record_limit then 'exhausted'
      when monthly_credit_limit is not null and coalesce(credits_used_month, 0) + coalesce(p_actual_credit_cost, 0) >= monthly_credit_limit then 'exhausted'
      when weekly_credit_limit is not null and coalesce(credits_used_week, 0) + coalesce(p_actual_credit_cost, 0) >= weekly_credit_limit then 'exhausted'
      when daily_credit_limit is not null and coalesce(credits_used_today, 0) + coalesce(p_actual_credit_cost, 0) >= daily_credit_limit then 'exhausted'
      when monthly_cost_limit is not null and coalesce(cost_used_month, 0) + coalesce(p_actual_cost_usd, 0) >= monthly_cost_limit then 'exhausted'
      when weekly_cost_limit is not null and coalesce(cost_used_week, 0) + coalesce(p_actual_cost_usd, 0) >= weekly_cost_limit then 'exhausted'
      when daily_cost_limit is not null and coalesce(cost_used_today, 0) + coalesce(p_actual_cost_usd, 0) >= daily_cost_limit then 'exhausted'
      else 'active'
    end,
    cooldown_until = case when status = 'cooldown' then cooldown_until else null end,
    updated_at = now()
  where id = v_reservation.api_key_id
  returning status into v_next_status;

  update public.external_provider_accounts
  set
    weekly_usage = coalesce(weekly_usage, 0) + coalesce(p_actual_cost_usd, 0),
    monthly_usage = coalesce(monthly_usage, 0) + coalesce(p_actual_cost_usd, 0),
    total_usage = coalesce(total_usage, 0) + coalesce(p_actual_cost_usd, 0),
    status = case
      when status in ('disabled', 'expired', 'suspended') then status
      when total_budget is not null and coalesce(total_usage, 0) + coalesce(p_actual_cost_usd, 0) >= total_budget then 'limited'
      when monthly_budget is not null and coalesce(monthly_usage, 0) + coalesce(p_actual_cost_usd, 0) >= monthly_budget then 'limited'
      when weekly_budget is not null and coalesce(weekly_usage, 0) + coalesce(p_actual_cost_usd, 0) >= weekly_budget then 'limited'
      else status
    end,
    updated_at = now()
  where id = v_reservation.provider_account_id;

  update public.external_usage_reservations
  set
    status = 'settled',
    settled_usage_event_id = p_usage_event_id,
    updated_at = now()
  where id = p_reservation_id;
end;
$$;

insert into public.external_provider_plan_profiles (
  provider,
  plan_name,
  plan_type,
  unit_type,
  free_entitlement_amount,
  renewal_interval,
  renewal_timezone,
  renewal_anchor_day,
  overage_enabled,
  overage_unit_price,
  currency,
  cost_rules,
  notes,
  is_active
)
values
  (
    'bright_data',
    'Bright Data Weekly Free',
    'free',
    'credit',
    5000,
    'weekly',
    'UTC',
    'monday',
    false,
    0,
    'USD',
    jsonb_build_object(
      'default', jsonb_build_object('unit_type', 'credit', 'bill_on', 'success', 'units_per_success', 1),
      'task_rules', jsonb_build_object(
        'linkedin_profile_lookup', jsonb_build_object('unit_type', 'credit', 'bill_on', 'success', 'units_per_record', 1),
        'linkedin_company_lookup', jsonb_build_object('unit_type', 'credit', 'bill_on', 'success', 'units_per_record', 1),
        'linkedin_post_lookup', jsonb_build_object('unit_type', 'credit', 'bill_on', 'success', 'units_per_record', 1)
      )
    ),
    'Editable seed profile for weekly Bright Data credit renewals.',
    true
  ),
  (
    'apify',
    'Apify Monthly Free',
    'free',
    'usd_credit',
    5,
    'monthly',
    'UTC',
    null,
    true,
    1,
    'USD',
    jsonb_build_object(
      'default', jsonb_build_object('unit_type', 'usd_credit', 'bill_on', 'provider_reported', 'provider_cost_field', 'usageUsd')
    ),
    'Editable seed profile for Apify USD credits.',
    true
  ),
  (
    'people_data_labs',
    'PDL Monthly Free',
    'free',
    'record',
    100,
    'monthly',
    'UTC',
    null,
    false,
    0,
    'USD',
    jsonb_build_object(
      'default', jsonb_build_object('unit_type', 'record', 'bill_on', 'success', 'units_per_record', 1)
    ),
    'Editable seed profile for People Data Labs free records.',
    true
  ),
  (
    'tavily',
    'Tavily Monthly Free',
    'free',
    'credit',
    1000,
    'monthly',
    'UTC',
    null,
    false,
    0,
    'USD',
    jsonb_build_object(
      'default', jsonb_build_object('unit_type', 'credit', 'bill_on', 'success', 'units_per_request', 1)
    ),
    'Editable seed profile for Tavily credits.',
    true
  ),
  (
    'serpapi',
    'SerpApi Monthly Free',
    'free',
    'search',
    250,
    'monthly',
    'UTC',
    null,
    false,
    0,
    'USD',
    jsonb_build_object(
      'default', jsonb_build_object('unit_type', 'search', 'bill_on', 'request', 'units_per_request', 1)
    ),
    'Editable seed profile for SerpApi searches.',
    true
  ),
  (
    'firecrawl',
    'Firecrawl Monthly Free',
    'free',
    'credit',
    1000,
    'monthly',
    'UTC',
    null,
    false,
    0,
    'USD',
    jsonb_build_object(
      'task_rules', jsonb_build_object(
        'website_crawl', jsonb_build_object('unit_type', 'credit', 'bill_on', 'success', 'units_per_page', 1)
      )
    ),
    'Editable seed profile for Firecrawl credits.',
    true
  ),
  (
    'scraperapi',
    'ScraperAPI Monthly Free',
    'free',
    'api_credit',
    1000,
    'monthly',
    'UTC',
    null,
    false,
    0,
    'USD',
    jsonb_build_object(
      'default', jsonb_build_object('unit_type', 'api_credit', 'bill_on', 'request', 'units_per_request', 1)
    ),
    'Editable seed profile for ScraperAPI credits.',
    true
  )
on conflict (provider, plan_name) do update
set
  plan_type = excluded.plan_type,
  unit_type = excluded.unit_type,
  free_entitlement_amount = excluded.free_entitlement_amount,
  renewal_interval = excluded.renewal_interval,
  renewal_timezone = excluded.renewal_timezone,
  renewal_anchor_day = excluded.renewal_anchor_day,
  overage_enabled = excluded.overage_enabled,
  overage_unit_price = excluded.overage_unit_price,
  currency = excluded.currency,
  cost_rules = excluded.cost_rules,
  notes = excluded.notes,
  is_active = excluded.is_active;

insert into public.external_alert_rules (
  provider,
  api_key_id,
  threshold_percent,
  alert_type,
  notify_master_admin,
  notify_company_admin,
  is_active
)
values
  (null, null, 50, 'info', true, false, true),
  (null, null, 70, 'warning', true, false, true),
  (null, null, 85, 'high', true, false, true),
  (null, null, 95, 'critical', true, false, true),
  (null, null, 100, 'exhausted', true, false, true),
  (null, null, null, 'projected_exhaustion', true, false, true),
  (null, null, null, 'trial_expiry', true, false, true),
  (null, null, null, 'fallback_started', true, false, true),
  (null, null, null, 'paid_cost_risk', true, false, true),
  (null, null, null, 'variance_detected', true, false, true),
  (null, null, null, 'all_keys_exhausted', true, false, true)
on conflict do nothing;
