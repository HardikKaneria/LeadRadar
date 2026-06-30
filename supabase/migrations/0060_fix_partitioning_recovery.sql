-- 0060 · Recovery for 0057 partial failure + billing plans seed
--
-- Root cause: 0057 used `select *` on job_runs_old whose physical column order
-- differed from the new partitioned table (payload/attempts/max_attempts were
-- appended via ALTER TABLE in 0031, landing after started_at/finished_at).
-- Additionally the partitioned table PK is (id, created_at), so ai_requests
-- cannot carry a FK to just `id` — drop it as a soft reference.

-- ── job_runs recovery ─────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'job_runs_old'
  ) then
    insert into public.job_runs (
      id, organization_id, queue_name, job_name, entity_type, entity_id,
      status, progress, error, result, payload, attempts, max_attempts,
      started_at, finished_at, created_at, updated_at
    )
    select
      id, organization_id, queue_name, job_name, entity_type, entity_id,
      status, progress, error, result, payload, attempts, max_attempts,
      started_at, finished_at, created_at, updated_at
    from public.job_runs_old
    on conflict (id, created_at) do nothing;

    -- Drop dangling FK and cascade-drop the old table
    -- (CASCADE also removes claim_next_job whose RETURNS SETOF pointed at job_runs_old)
    alter table public.ai_requests
      drop constraint if exists ai_requests_job_run_id_fkey;

    drop table public.job_runs_old cascade;
  end if;
end $$;

-- Recreate claim_next_job pointing at the new partitioned table
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

-- ── ai_requests recovery ──────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'ai_requests_old'
  ) then
    insert into public.ai_requests (
      id, organization_id, user_id, api_key_id, provider, model, task_type,
      ai_prompt_version_id, input_tokens, output_tokens, cost_usd, latency_ms,
      error, created_at
    )
    select
      id, organization_id, user_id, api_key_id, provider, model, task_type,
      ai_prompt_version_id, input_tokens, output_tokens, cost_usd, latency_ms,
      error, created_at
    from public.ai_requests_old
    on conflict (id, created_at) do nothing;

    drop table public.ai_requests_old;
  end if;
end $$;
