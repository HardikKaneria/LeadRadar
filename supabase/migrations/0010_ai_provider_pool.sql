-- Phase 3 · AI Provider key pool (P3-12).
-- Platform-scoped provider accounts + encrypted keys + model catalog + health/rate-limit telemetry.
-- Tenant clients never read these tables directly; the thin API/worker use the service role.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_provider') then
    create type public.ai_provider as enum (
      'gemini', 'groq', 'openrouter', 'ollama', 'openai', 'anthropic', 'other'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_provider_account_type') then
    create type public.ai_provider_account_type as enum ('free_tier', 'paid', 'byok', 'self_hosted');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_provider_account_status') then
    create type public.ai_provider_account_status as enum ('active', 'limited', 'disabled');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_api_key_status') then
    create type public.ai_api_key_status as enum (
      'active', 'limited', 'cooldown', 'exhausted', 'failed', 'revoked'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_provider_health_status') then
    create type public.ai_provider_health_status as enum ('ok', 'degraded', 'down');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_provider_limit_type') then
    create type public.ai_provider_limit_type as enum ('rpm', 'tpm', 'daily', 'monthly');
  end if;
end
$$;

create table if not exists public.ai_provider_accounts (
  id              uuid primary key default gen_random_uuid(),
  provider        public.ai_provider not null,
  account_name    text not null,
  account_type    public.ai_provider_account_type not null default 'free_tier',
  billing_owner   text,
  status          public.ai_provider_account_status not null default 'active',
  monthly_budget  numeric(12, 2),
  monthly_usage   numeric(12, 2) not null default 0,
  rate_limit_rpm  integer,
  rate_limit_tpm  integer,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (provider, account_name),
  check (monthly_budget is null or monthly_budget >= 0),
  check (monthly_usage >= 0),
  check (rate_limit_rpm is null or rate_limit_rpm >= 0),
  check (rate_limit_tpm is null or rate_limit_tpm >= 0)
);

create index if not exists ai_provider_accounts_provider_status_idx
  on public.ai_provider_accounts (provider, status, created_at desc);

drop trigger if exists ai_provider_accounts_set_updated_at on public.ai_provider_accounts;
create trigger ai_provider_accounts_set_updated_at
  before update on public.ai_provider_accounts
  for each row execute function public.set_updated_at();

create table if not exists public.ai_api_keys (
  id                    uuid primary key default gen_random_uuid(),
  provider_account_id   uuid not null references public.ai_provider_accounts (id) on delete cascade,
  provider              public.ai_provider not null,
  key_name              text not null,
  encrypted_api_key     text not null,
  status                public.ai_api_key_status not null default 'active',
  environment           text not null default 'production',
  allowed_task_types    text[] not null default '{}'::text[],
  daily_request_limit   integer,
  monthly_token_limit   bigint,
  monthly_cost_limit    numeric(12, 2),
  requests_used_today   integer not null default 0,
  tokens_used_month     bigint not null default 0,
  cost_used_month       numeric(12, 2) not null default 0,
  last_used_at          timestamptz,
  last_error            text,
  cooldown_until        timestamptz,
  created_by            uuid references auth.users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  revoked_at            timestamptz,
  unique (provider_account_id, key_name),
  check (daily_request_limit is null or daily_request_limit >= 0),
  check (monthly_token_limit is null or monthly_token_limit >= 0),
  check (monthly_cost_limit is null or monthly_cost_limit >= 0),
  check (requests_used_today >= 0),
  check (tokens_used_month >= 0),
  check (cost_used_month >= 0)
);

create index if not exists ai_api_keys_provider_status_idx
  on public.ai_api_keys (provider, status, cooldown_until, revoked_at);
create index if not exists ai_api_keys_provider_account_status_idx
  on public.ai_api_keys (provider_account_id, status, created_at desc);

drop trigger if exists ai_api_keys_set_updated_at on public.ai_api_keys;
create trigger ai_api_keys_set_updated_at
  before update on public.ai_api_keys
  for each row execute function public.set_updated_at();

create table if not exists public.ai_model_catalog (
  id                    uuid primary key default gen_random_uuid(),
  provider              public.ai_provider not null,
  model                 text not null,
  display_name          text not null,
  context_window        integer,
  max_output            integer,
  supports_json         boolean not null default false,
  supports_embedding    boolean not null default false,
  embedding_dims        integer,
  input_cost_per_mtok   numeric(10, 4),
  output_cost_per_mtok  numeric(10, 4),
  is_free_tier          boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (provider, model),
  check (context_window is null or context_window >= 0),
  check (max_output is null or max_output >= 0),
  check (embedding_dims is null or embedding_dims >= 0),
  check (input_cost_per_mtok is null or input_cost_per_mtok >= 0),
  check (output_cost_per_mtok is null or output_cost_per_mtok >= 0)
);

create index if not exists ai_model_catalog_provider_active_idx
  on public.ai_model_catalog (provider, is_active, is_free_tier);

drop trigger if exists ai_model_catalog_set_updated_at on public.ai_model_catalog;
create trigger ai_model_catalog_set_updated_at
  before update on public.ai_model_catalog
  for each row execute function public.set_updated_at();

create table if not exists public.ai_provider_health_checks (
  id                  uuid primary key default gen_random_uuid(),
  provider            public.ai_provider not null,
  provider_account_id uuid references public.ai_provider_accounts (id) on delete cascade,
  api_key_id          uuid references public.ai_api_keys (id) on delete cascade,
  status              public.ai_provider_health_status not null,
  latency_ms          integer,
  checked_at          timestamptz not null default now(),
  detail              jsonb not null default '{}'::jsonb,
  check (latency_ms is null or latency_ms >= 0)
);

create index if not exists ai_provider_health_checks_lookup_idx
  on public.ai_provider_health_checks (provider, checked_at desc);
create index if not exists ai_provider_health_checks_key_idx
  on public.ai_provider_health_checks (api_key_id, checked_at desc);

create table if not exists public.ai_provider_rate_limit_events (
  id                  uuid primary key default gen_random_uuid(),
  provider            public.ai_provider not null,
  provider_account_id uuid references public.ai_provider_accounts (id) on delete cascade,
  api_key_id          uuid references public.ai_api_keys (id) on delete cascade,
  task_type           text,
  limit_type          public.ai_provider_limit_type not null,
  occurred_at         timestamptz not null default now(),
  retry_after_seconds integer,
  detail              jsonb not null default '{}'::jsonb,
  check (retry_after_seconds is null or retry_after_seconds >= 0)
);

create index if not exists ai_provider_rate_limit_events_lookup_idx
  on public.ai_provider_rate_limit_events (provider, occurred_at desc);
create index if not exists ai_provider_rate_limit_events_key_idx
  on public.ai_provider_rate_limit_events (api_key_id, occurred_at desc);

alter table public.ai_provider_accounts enable row level security;
alter table public.ai_api_keys enable row level security;
alter table public.ai_model_catalog enable row level security;
alter table public.ai_provider_health_checks enable row level security;
alter table public.ai_provider_rate_limit_events enable row level security;

insert into public.ai_model_catalog (
  provider,
  model,
  display_name,
  context_window,
  max_output,
  supports_json,
  supports_embedding,
  embedding_dims,
  input_cost_per_mtok,
  output_cost_per_mtok,
  is_free_tier,
  is_active
)
values
  ('gemini', 'gemini-1.5-flash', 'Gemini 1.5 Flash', null, 8192, true, false, null, null, null, true, true),
  ('gemini', 'gemini-1.5-pro', 'Gemini 1.5 Pro', null, 8192, true, false, null, null, null, false, true),
  ('gemini', 'text-embedding-004', 'Gemini Text Embedding 004', null, null, false, true, 1536, null, null, true, true),
  ('groq', 'llama-3.1-8b-instant', 'Groq Llama 3.1 8B Instant', null, 8192, true, false, null, null, null, true, true),
  ('openrouter', 'meta-llama/llama-3.1-8b-instruct:free', 'OpenRouter Llama 3.1 8B Instruct (Free)', null, 8192, true, false, null, null, null, true, true)
on conflict (provider, model) do update
set
  display_name = excluded.display_name,
  context_window = excluded.context_window,
  max_output = excluded.max_output,
  supports_json = excluded.supports_json,
  supports_embedding = excluded.supports_embedding,
  embedding_dims = excluded.embedding_dims,
  input_cost_per_mtok = excluded.input_cost_per_mtok,
  output_cost_per_mtok = excluded.output_cost_per_mtok,
  is_free_tier = excluded.is_free_tier,
  is_active = excluded.is_active;
