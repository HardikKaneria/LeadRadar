-- Phase 3 · AI request burst limits (P3-04).
-- Adds the per-company short-window request-rate override used by the Redis token bucket.

alter table public.company_usage_limits
  add column if not exists request_rate_limit_rpm bigint;

comment on column public.company_usage_limits.request_rate_limit_rpm is
  'Optional per-company override for the short-window AI request token bucket (requests per minute). Null = platform default; 0 = disabled.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_usage_limits_request_rate_limit_rpm_nonnegative'
  ) then
    alter table public.company_usage_limits
      add constraint company_usage_limits_request_rate_limit_rpm_nonnegative
      check (request_rate_limit_rpm is null or request_rate_limit_rpm >= 0);
  end if;
end
$$;
