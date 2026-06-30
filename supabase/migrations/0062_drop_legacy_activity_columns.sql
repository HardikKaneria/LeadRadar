-- Phase 4 · Schema cleanup
-- Drop legacy columns from activities table now that type, summary, and metadata are backfilled.

alter table public.activities
  drop column if exists verb,
  drop column if exists meta;
