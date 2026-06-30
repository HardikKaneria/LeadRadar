-- P9-01 · Heat & expiry recompute
-- Adds notify_opportunity_expiring preference and extends the notifications type check.

alter table public.notification_preferences
  add column if not exists notify_opportunity_expiring boolean not null default true;

-- Widen the notifications.type check to include all current types.
-- Postgres requires dropping and re-adding the constraint.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'lead_stale',
    'follow_up_due',
    'follow_up_overdue',
    'weekly_insight',
    'opportunity_expiring',
    'general'
  ));
