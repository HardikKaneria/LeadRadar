-- Phase 10 · External Provider Cost Intelligence — Cost Rules Hierarchy (P10-14).
-- Adds structured cost-rule tables so cost calculation can be driven by DB-configured rules
-- rather than relying solely on the JSONB cost_rules blob inside plan profiles.
-- All changes are additive-only. No existing columns are dropped.

-- 1A. Extend external_provider_unit_type with new billing granularities.
alter type public.external_provider_unit_type add value if not exists 'successful_record';
alter type public.external_provider_unit_type add value if not exists 'failed_request';
alter type public.external_provider_unit_type add value if not exists 'result';
alter type public.external_provider_unit_type add value if not exists 'browser_minute';
alter type public.external_provider_unit_type add value if not exists 'data_transfer_mb';
alter type public.external_provider_unit_type add value if not exists 'provider_reported';
alter type public.external_provider_unit_type add value if not exists 'custom';

-- 1B. New enum types (wrapped in DO $$ so we can check existence first).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'external_cost_rule_scope') then
    create type public.external_cost_rule_scope as enum (
      'provider_default',
      'endpoint',
      'dataset',
      'actor',
      'task_type',
      'option_multiplier',
      'response_field',
      'manual_override'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_billing_event') then
    create type public.external_billing_event as enum (
      'before_call',
      'after_success',
      'after_failure',
      'after_provider_report',
      'after_response_count'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_cost_source') then
    create type public.external_cost_source as enum (
      'estimated',
      'calculated',
      'provider_reported',
      'manual_adjusted',
      'reconciled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'external_route_behavior_mode') then
    create type public.external_route_behavior_mode as enum (
      'free_only',
      'free_then_fallback',
      'allow_paid_with_budget',
      'manual_approval_required',
      'test_only'
    );
  end if;
end
$$;

-- 1C. external_cost_rules — structured billing rules per provider/scope.
create table if not exists public.external_cost_rules (
  id                              uuid primary key default gen_random_uuid(),
  provider                        public.external_provider not null,
  provider_account_id             uuid references public.external_provider_accounts (id) on delete set null,
  plan_profile_id                 uuid references public.external_provider_plan_profiles (id) on delete set null,
  rule_name                       text not null,
  rule_scope                      public.external_cost_rule_scope not null,
  task_type                       public.external_provider_task_type,
  endpoint_key                    text,
  dataset_key                     text,
  actor_key                       text,
  unit_type                       public.external_provider_unit_type not null,
  billing_event                   public.external_billing_event not null default 'after_success',
  base_units                      numeric(14,4) not null default 0,
  units_per_request               numeric(14,4) not null default 0,
  units_per_record                numeric(14,4) not null default 0,
  units_per_successful_record     numeric(14,4) not null default 0,
  units_per_failed_request        numeric(14,4) not null default 0,
  units_per_page                  numeric(14,4) not null default 0,
  units_per_search                numeric(14,4) not null default 0,
  units_per_result                numeric(14,4) not null default 0,
  units_per_browser_minute        numeric(14,4) not null default 0,
  units_per_mb                    numeric(14,4) not null default 0,
  unit_price_usd                  numeric(12,6) not null default 0,
  minimum_units                   numeric(14,4) not null default 0,
  maximum_units                   numeric(14,4),
  free_tier_eligible              boolean not null default true,
  priority                        integer not null default 100,
  formula_json                    jsonb not null default '{}'::jsonb,
  conditions_json                 jsonb not null default '{}'::jsonb,
  is_active                       boolean not null default true,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  check (base_units >= 0),
  check (units_per_request >= 0),
  check (units_per_record >= 0),
  check (units_per_successful_record >= 0),
  check (units_per_failed_request >= 0),
  check (units_per_page >= 0),
  check (units_per_search >= 0),
  check (units_per_result >= 0),
  check (units_per_browser_minute >= 0),
  check (units_per_mb >= 0),
  check (unit_price_usd >= 0),
  check (minimum_units >= 0),
  check (maximum_units is null or maximum_units >= 0),
  check (priority >= 0)
);

create index if not exists external_cost_rules_provider_scope_idx
  on public.external_cost_rules (provider, is_active, rule_scope, priority);

create index if not exists external_cost_rules_provider_task_idx
  on public.external_cost_rules (provider, task_type, is_active, priority)
  where task_type is not null;

create index if not exists external_cost_rules_provider_endpoint_idx
  on public.external_cost_rules (provider, endpoint_key, is_active, priority)
  where endpoint_key is not null;

create index if not exists external_cost_rules_provider_dataset_idx
  on public.external_cost_rules (provider, dataset_key, is_active, priority)
  where dataset_key is not null;

drop trigger if exists external_cost_rules_set_updated_at on public.external_cost_rules;
create trigger external_cost_rules_set_updated_at
  before update on public.external_cost_rules
  for each row execute function public.set_updated_at();

alter table public.external_cost_rules enable row level security;

-- 1D. external_option_cost_multipliers — option-level multipliers (e.g. render_js=10x).
create table if not exists public.external_option_cost_multipliers (
  id                      uuid primary key default gen_random_uuid(),
  provider                public.external_provider not null,
  cost_rule_id            uuid references public.external_cost_rules (id) on delete set null,
  option_key              text not null,
  option_value            text,
  multiplier              numeric(10,4) not null default 1,
  additional_units        numeric(14,4) not null default 0,
  additional_cost_usd     numeric(12,6) not null default 0,
  applies_to_task_types   text[] not null default '{}',
  conditions_json         jsonb not null default '{}'::jsonb,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  check (multiplier >= 0),
  check (additional_units >= 0),
  check (additional_cost_usd >= 0)
);

create index if not exists external_option_cost_multipliers_provider_idx
  on public.external_option_cost_multipliers (provider, is_active, option_key);

alter table public.external_option_cost_multipliers enable row level security;

-- 1E. external_endpoint_catalog — canonical endpoint registry per provider.
create table if not exists public.external_endpoint_catalog (
  id                         uuid primary key default gen_random_uuid(),
  provider                   public.external_provider not null,
  endpoint_key               text not null,
  display_name               text not null,
  task_types                 text[] not null default '{}',
  dataset_key                text,
  actor_key                  text,
  default_unit_type          public.external_provider_unit_type,
  default_cost_rule_id       uuid references public.external_cost_rules (id) on delete set null,
  supports_test_flow         boolean not null default false,
  test_payload_json          jsonb not null default '{}'::jsonb,
  notes                      text,
  is_active                  boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (provider, endpoint_key)
);

create index if not exists external_endpoint_catalog_provider_idx
  on public.external_endpoint_catalog (provider, is_active, endpoint_key);

drop trigger if exists external_endpoint_catalog_set_updated_at on public.external_endpoint_catalog;
create trigger external_endpoint_catalog_set_updated_at
  before update on public.external_endpoint_catalog
  for each row execute function public.set_updated_at();

alter table public.external_endpoint_catalog enable row level security;

-- 1F. Extend external_usage_events with rich cost-breakdown columns.
alter table public.external_usage_events
  add column if not exists endpoint_key                 text,
  add column if not exists dataset_key                  text,
  add column if not exists actor_key                    text,
  add column if not exists base_units                   numeric(14,4) not null default 0,
  add column if not exists multiplier_total             numeric(10,4) not null default 1,
  add column if not exists final_units                  numeric(14,4) not null default 0,
  add column if not exists billable_units               numeric(14,4) not null default 0,
  add column if not exists unit_price_usd               numeric(12,6) not null default 0,
  add column if not exists calculated_cost_usd          numeric(12,6) not null default 0,
  add column if not exists successful_record_count      bigint not null default 0,
  add column if not exists failed_record_count          bigint not null default 0,
  add column if not exists result_count                 bigint not null default 0,
  add column if not exists browser_minutes              numeric(14,4) not null default 0,
  add column if not exists data_transfer_mb             numeric(14,4) not null default 0,
  add column if not exists provider_reported_units      numeric(14,4),
  add column if not exists provider_reported_cost_usd   numeric(12,6),
  add column if not exists cost_source                  public.external_cost_source,
  add column if not exists cost_rule_id                 uuid references public.external_cost_rules (id) on delete set null,
  add column if not exists cost_breakdown_json          jsonb not null default '{}'::jsonb;

-- Add check constraints for the new columns (drop+add pattern for idempotency).
alter table public.external_usage_events
  drop constraint if exists external_usage_events_base_units_check,
  add constraint external_usage_events_base_units_check check (base_units >= 0);

alter table public.external_usage_events
  drop constraint if exists external_usage_events_multiplier_total_check,
  add constraint external_usage_events_multiplier_total_check check (multiplier_total >= 0);

alter table public.external_usage_events
  drop constraint if exists external_usage_events_final_units_check,
  add constraint external_usage_events_final_units_check check (final_units >= 0);

alter table public.external_usage_events
  drop constraint if exists external_usage_events_billable_units_check,
  add constraint external_usage_events_billable_units_check check (billable_units >= 0);

alter table public.external_usage_events
  drop constraint if exists external_usage_events_unit_price_usd_check,
  add constraint external_usage_events_unit_price_usd_check check (unit_price_usd >= 0);

alter table public.external_usage_events
  drop constraint if exists external_usage_events_calculated_cost_usd_check,
  add constraint external_usage_events_calculated_cost_usd_check check (calculated_cost_usd >= 0);

alter table public.external_usage_events
  drop constraint if exists external_usage_events_successful_record_count_check,
  add constraint external_usage_events_successful_record_count_check check (successful_record_count >= 0);

alter table public.external_usage_events
  drop constraint if exists external_usage_events_failed_record_count_check,
  add constraint external_usage_events_failed_record_count_check check (failed_record_count >= 0);

alter table public.external_usage_events
  drop constraint if exists external_usage_events_result_count_check,
  add constraint external_usage_events_result_count_check check (result_count >= 0);

alter table public.external_usage_events
  drop constraint if exists external_usage_events_browser_minutes_check,
  add constraint external_usage_events_browser_minutes_check check (browser_minutes >= 0);

alter table public.external_usage_events
  drop constraint if exists external_usage_events_data_transfer_mb_check,
  add constraint external_usage_events_data_transfer_mb_check check (data_transfer_mb >= 0);

-- 1G. external_cost_adjustments — manual corrections / reconciliation deltas.
create table if not exists public.external_cost_adjustments (
  id                    uuid primary key default gen_random_uuid(),
  usage_event_id        uuid references public.external_usage_events (id) on delete set null,
  provider              public.external_provider not null,
  provider_account_id   uuid references public.external_provider_accounts (id) on delete set null,
  api_key_id            uuid references public.external_api_keys (id) on delete set null,
  period_start          timestamptz,
  period_end            timestamptz,
  adjustment_type       text not null,
  unit_delta            numeric(14,4) not null default 0,
  cost_delta_usd        numeric(12,6) not null default 0,
  reason                text not null,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  check (adjustment_type in ('manual_correction','provider_reconciliation','refund','failed_charge_correction','pricing_rule_update'))
);

create index if not exists external_cost_adjustments_provider_created_idx
  on public.external_cost_adjustments (provider, created_at desc);

alter table public.external_cost_adjustments enable row level security;

-- Seed data is in 0073_external_cost_rules_seed.sql (separate transaction required because
-- PostgreSQL 12+ forbids using new enum values in the same transaction where they were added).
