-- P9-11 · Performance & scale pass
-- Table partitioning for job_runs and ai_requests

-- ==========================================
-- 1. Partitioning job_runs
-- ==========================================

-- Rename the old table
alter table public.job_runs rename to job_runs_old;

-- Create the new partitioned table (partition by range on created_at)
create table public.job_runs (
  id              uuid default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  queue_name      text not null,
  job_name        text not null,
  entity_type     text,
  entity_id       uuid,
  status          public.job_status not null default 'queued',
  progress        smallint not null default 0,
  error           text,
  result          jsonb,
  payload         jsonb,
  attempts        smallint not null default 0,
  max_attempts    smallint not null default 3,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

-- Create current partitions (2025, 2026, 2027)
create table public.job_runs_y2025 partition of public.job_runs for values from ('2025-01-01') to ('2026-01-01');
create table public.job_runs_y2026 partition of public.job_runs for values from ('2026-01-01') to ('2027-01-01');
create table public.job_runs_y2027 partition of public.job_runs for values from ('2027-01-01') to ('2028-01-01');

-- Default partition for out of bounds dates
create table public.job_runs_default partition of public.job_runs default;

-- Recreate indices on the partitioned table
create index if not exists job_runs_org_status_idx on public.job_runs (organization_id, status, created_at);
create index if not exists job_runs_queue_poll_idx on public.job_runs (queue_name, status, created_at asc) where status = 'queued';

-- Insert data from old table (explicit columns — old table had a different physical column order
-- because payload/attempts/max_attempts were added via ALTER TABLE ADD COLUMN in 0031,
-- appending them after started_at/finished_at. select * would map timestamptz into jsonb payload.)
insert into public.job_runs (
  id, organization_id, queue_name, job_name, entity_type, entity_id,
  status, progress, error, result, payload, attempts, max_attempts,
  started_at, finished_at, created_at, updated_at
)
select
  id, organization_id, queue_name, job_name, entity_type, entity_id,
  status, progress, error, result, payload, attempts, max_attempts,
  started_at, finished_at, created_at, updated_at
from public.job_runs_old;

-- Drop FK on ai_requests that referenced job_runs; PG cannot FK to just `id` on a
-- partitioned table whose PK is (id, created_at). The relationship is kept as a
-- soft reference (no enforced constraint); CASCADE also drops claim_next_job whose
-- RETURNS SETOF type pointed at job_runs_old (recreated below).
alter table public.ai_requests
  drop constraint if exists ai_requests_job_run_id_fkey;

drop table public.job_runs_old cascade;

-- Update the claim_next_job function to point to the partitioned table (since FOR UPDATE SKIP LOCKED works on partitioned tables in PG 12+)
create or replace function public.claim_next_job(p_queue_name text)
returns setof public.job_runs
language sql
security definer
as $$
  update public.job_runs
  set status = 'running', started_at = now(), attempts = attempts + 1, updated_at = now()
  where id = (
    select id from public.job_runs
    where queue_name = p_queue_name and status = 'queued'
    order by created_at asc
    limit 1
    for update skip locked
  )
  returning *;
$$;


-- ==========================================
-- 2. Partitioning ai_requests
-- ==========================================

-- Drop the foreign keys from other tables that point to ai_requests(id)
alter table public.ai_usage_events drop constraint ai_usage_events_ai_request_id_fkey;
alter table public.outreach_messages drop constraint outreach_messages_ai_request_id_fkey;
alter table public.proposals drop constraint proposals_ai_request_id_fkey;

-- Rename old table
alter table public.ai_requests rename to ai_requests_old;

-- Create the new partitioned table
create table public.ai_requests (
  id                  uuid default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  user_id             uuid references auth.users (id) on delete set null,
  api_key_id          uuid references public.ai_api_keys (id) on delete set null,
  provider            public.ai_provider not null,
  model               text not null,
  task_type           text not null,
  ai_prompt_version_id uuid,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cost_usd            numeric(12, 6) not null default 0,
  latency_ms          integer not null default 0,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);

-- Add constraints to the partitioned table
alter table public.ai_requests
  add constraint ai_requests_task_type_check check (
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
  add constraint ai_requests_input_tokens_check check (input_tokens >= 0),
  add constraint ai_requests_output_tokens_check check (output_tokens >= 0),
  add constraint ai_requests_cost_usd_check check (cost_usd >= 0),
  add constraint ai_requests_latency_ms_check check (latency_ms >= 0);

-- Create current partitions
create table public.ai_requests_y2025 partition of public.ai_requests for values from ('2025-01-01') to ('2026-01-01');
create table public.ai_requests_y2026 partition of public.ai_requests for values from ('2026-01-01') to ('2027-01-01');
create table public.ai_requests_y2027 partition of public.ai_requests for values from ('2027-01-01') to ('2028-01-01');
create table public.ai_requests_default partition of public.ai_requests default;

-- Recreate indices on the partitioned table
create index if not exists ai_requests_org_task_created_idx on public.ai_requests (organization_id, task_type, created_at desc);
create index if not exists ai_requests_org_provider_created_idx on public.ai_requests (organization_id, provider, created_at desc);
create index if not exists ai_requests_api_key_created_idx on public.ai_requests (api_key_id, created_at desc);
create index if not exists ai_requests_prompt_version_idx on public.ai_requests (ai_prompt_version_id);

-- Enable RLS and add policies
alter table public.ai_requests enable row level security;
create policy "ai_requests audit read"
  on public.ai_requests
  for select using (public.has_permission(organization_id, 'audit.read'));

-- Insert data from old table (explicit columns; updated_at excluded — not present in original table)
insert into public.ai_requests (
  id, organization_id, user_id, api_key_id, provider, model, task_type,
  ai_prompt_version_id, input_tokens, output_tokens, cost_usd, latency_ms,
  error, created_at
)
select
  id, organization_id, user_id, api_key_id, provider, model, task_type,
  ai_prompt_version_id, input_tokens, output_tokens, cost_usd, latency_ms,
  error, created_at
from public.ai_requests_old;

-- Drop old table
drop table public.ai_requests_old;
