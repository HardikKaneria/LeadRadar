-- Add columns for Supabase-based job queue (replacing BullMQ/Redis)
ALTER TABLE public.job_runs ADD COLUMN IF NOT EXISTS payload jsonb;
ALTER TABLE public.job_runs ADD COLUMN IF NOT EXISTS attempts smallint NOT NULL DEFAULT 0;
ALTER TABLE public.job_runs ADD COLUMN IF NOT EXISTS max_attempts smallint NOT NULL DEFAULT 3;

-- Index for efficient queue polling
CREATE INDEX IF NOT EXISTS job_runs_queue_poll_idx 
  ON public.job_runs (queue_name, status, created_at ASC) 
  WHERE status = 'queued';

-- Atomic job claim function
CREATE OR REPLACE FUNCTION public.claim_next_job(p_queue_name text)
RETURNS SETOF public.job_runs
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.job_runs
  SET status = 'running', started_at = now(), attempts = attempts + 1, updated_at = now()
  WHERE id = (
    SELECT id FROM public.job_runs
    WHERE queue_name = p_queue_name AND status = 'queued'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;
