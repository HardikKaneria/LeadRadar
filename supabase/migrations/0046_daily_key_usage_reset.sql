-- Reset requests_used_today at midnight UTC via a Postgres function + pg_cron.
-- pg_cron must be enabled in the Supabase dashboard (Extensions → pg_cron).
--
-- The function is safe to call manually at any time; it resets only the daily
-- counter, leaving monthly token/cost counters untouched.

create or replace function reset_daily_ai_key_usage()
returns void
language sql
security definer
as $$
  update ai_api_keys
  set    requests_used_today = 0,
         -- If the key was in cooldown for a daily quota reason and is now reset,
         -- the pool eligibility check will re-admit it next call.
         updated_at = now()
  where  requests_used_today > 0;
$$;

-- Schedule the reset at 00:01 UTC every day (pg_cron must be enabled).
-- If pg_cron is not available this block is skipped gracefully.
do $$
begin
  if exists (
    select 1
    from   pg_extension
    where  extname = 'pg_cron'
  ) then
    perform cron.schedule(
      'reset-daily-ai-key-usage',
      '1 0 * * *',
      'select reset_daily_ai_key_usage()'
    );
  end if;
end $$;
