-- Phase 3 · AI usage ledger + quotas/credits (P3-14).
-- Adds the technical request log, billing ledger, and per-company usage caps/credits.
-- `ai_prompt_versions` is landing in the separately claimed P3-03 task, so the request log keeps
-- an additive nullable `ai_prompt_version_id` seam for that later FK/not-null hardening step.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_call_status') then
    create type public.ai_call_status as enum ('ok', 'error', 'fallback');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'usage_credit_metric') then
    create type public.usage_credit_metric as enum (
      'ai_requests',
      'ai_tokens',
      'ai_cost_usd',
      'opportunity_analysis',
      'proposal_generations',
      'company_research',
      'embeddings'
    );
  end if;
end
$$;

create table if not exists public.ai_requests (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  user_id               uuid references auth.users (id) on delete set null,
  task_type             text not null,
  provider              public.ai_provider not null,
  model                 text not null,
  ai_prompt_version_id  uuid,
  input_tokens          integer not null default 0,
  output_tokens         integer not null default 0,
  cost_usd              numeric(12, 6) not null default 0,
  latency_ms            integer not null default 0,
  status                public.ai_call_status not null,
  error                 text,
  job_run_id            uuid references public.job_runs (id) on delete set null,
  request_ref           jsonb not null default '{}'::jsonb,
  api_key_id            uuid references public.ai_api_keys (id) on delete set null,
  provider_account_id   uuid references public.ai_provider_accounts (id) on delete set null,
  is_free_tier          boolean not null default false,
  created_at            timestamptz not null default now(),
  check (
    task_type = any (
      array[
        'opportunity_analyzer',
        'action_planner',
        'company_research',
        'sales_message',
        'follow_up_message',
        'conversation_summary',
        'proposal_generator',
        'meeting_prep',
        'next_action',
        'embedding',
        'learning_summary'
      ]::text[]
    )
  ),
  check (input_tokens >= 0),
  check (output_tokens >= 0),
  check (cost_usd >= 0),
  check (latency_ms >= 0)
);

comment on column public.ai_requests.ai_prompt_version_id is
  'Deferred seam for P3-03 ai_prompt_versions; nullable until the prompt-version table and gateway stamping land.';

create index if not exists ai_requests_org_task_created_idx
  on public.ai_requests (organization_id, task_type, created_at desc);
create index if not exists ai_requests_org_provider_created_idx
  on public.ai_requests (organization_id, provider, created_at desc);
create index if not exists ai_requests_api_key_created_idx
  on public.ai_requests (api_key_id, created_at desc);

create table if not exists public.ai_usage_events (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  user_id             uuid references auth.users (id) on delete set null,
  provider            public.ai_provider not null,
  model               text not null,
  task_type           text not null,
  ai_request_id       uuid not null references public.ai_requests (id) on delete cascade,
  api_key_id          uuid references public.ai_api_keys (id) on delete set null,
  provider_account_id uuid references public.ai_provider_accounts (id) on delete set null,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  total_tokens        bigint not null default 0,
  estimated_cost      numeric(12, 6) not null default 0,
  is_free_tier        boolean not null default false,
  status              public.ai_call_status not null default 'ok',
  created_at          timestamptz not null default now(),
  check (
    task_type = any (
      array[
        'opportunity_analyzer',
        'action_planner',
        'company_research',
        'sales_message',
        'follow_up_message',
        'conversation_summary',
        'proposal_generator',
        'meeting_prep',
        'next_action',
        'embedding',
        'learning_summary'
      ]::text[]
    )
  ),
  check (input_tokens >= 0),
  check (output_tokens >= 0),
  check (total_tokens >= 0),
  check (estimated_cost >= 0)
);

create index if not exists ai_usage_events_org_created_idx
  on public.ai_usage_events (organization_id, created_at desc);
create index if not exists ai_usage_events_org_user_created_idx
  on public.ai_usage_events (organization_id, user_id, created_at desc);
create index if not exists ai_usage_events_api_key_created_idx
  on public.ai_usage_events (api_key_id, created_at desc);
create index if not exists ai_usage_events_provider_model_created_idx
  on public.ai_usage_events (provider, model, created_at desc);
create index if not exists ai_usage_events_task_created_idx
  on public.ai_usage_events (task_type, created_at desc);

create table if not exists public.company_usage_limits (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations (id) on delete cascade,
  period                      text not null,
  ai_requests_limit           bigint,
  ai_tokens_limit             bigint,
  ai_cost_limit               numeric(12, 6),
  opportunity_analysis_limit  bigint,
  proposal_generation_limit   bigint,
  company_research_limit      bigint,
  embedding_limit             bigint,
  used_requests               bigint not null default 0,
  used_tokens                 bigint not null default 0,
  used_cost                   numeric(12, 6) not null default 0,
  reset_at                    timestamptz not null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (organization_id, period),
  check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  check (ai_requests_limit is null or ai_requests_limit >= 0),
  check (ai_tokens_limit is null or ai_tokens_limit >= 0),
  check (ai_cost_limit is null or ai_cost_limit >= 0),
  check (opportunity_analysis_limit is null or opportunity_analysis_limit >= 0),
  check (proposal_generation_limit is null or proposal_generation_limit >= 0),
  check (company_research_limit is null or company_research_limit >= 0),
  check (embedding_limit is null or embedding_limit >= 0),
  check (used_requests >= 0),
  check (used_tokens >= 0),
  check (used_cost >= 0)
);

create index if not exists company_usage_limits_org_reset_idx
  on public.company_usage_limits (organization_id, reset_at);

drop trigger if exists company_usage_limits_set_updated_at on public.company_usage_limits;
create trigger company_usage_limits_set_updated_at
  before update on public.company_usage_limits
  for each row execute function public.set_updated_at();

create table if not exists public.usage_credit_grants (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  granted_by        uuid references auth.users (id) on delete set null,
  metric            public.usage_credit_metric not null,
  amount            numeric(12, 6) not null,
  reason            text,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  check (amount >= 0)
);

create index if not exists usage_credit_grants_org_metric_idx
  on public.usage_credit_grants (organization_id, metric, created_at desc);
create index if not exists usage_credit_grants_org_expires_idx
  on public.usage_credit_grants (organization_id, expires_at);

alter table public.ai_requests enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.company_usage_limits enable row level security;
alter table public.usage_credit_grants enable row level security;

create policy "ai_requests audit read"
  on public.ai_requests
  for select using (public.has_permission(organization_id, 'audit.read'));

create policy "ai_usage_events company or self read"
  on public.ai_usage_events
  for select using (
    public.has_permission(organization_id, 'usage.read_company')
    or public.has_permission(organization_id, 'company.usage.read')
    or (
      auth.uid() = user_id
      and public.has_permission(organization_id, 'usage.read_own')
    )
  );

create policy "company_usage_limits usage read"
  on public.company_usage_limits
  for select using (
    public.has_permission(organization_id, 'company.usage.read')
    or public.has_permission(organization_id, 'usage.read_company')
    or public.has_permission(organization_id, 'usage.read_company_summary')
  );

create policy "usage_credit_grants company read"
  on public.usage_credit_grants
  for select using (
    public.has_permission(organization_id, 'company.usage.read')
    or public.has_permission(organization_id, 'usage.read_company')
  );
