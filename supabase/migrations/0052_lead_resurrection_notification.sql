-- Adds notify_lead_resurrection preference and extends the notifications type check.

alter table public.notification_preferences
  add column if not exists notify_lead_resurrection boolean not null default true;

-- We need to drop the constraint and re-add it to include 'lead_resurrection'
-- The constraint was originally named 'notifications_type_check'
alter table public.notifications drop constraint if exists notifications_type_check;

-- Note: In previous migrations, opportunity_expiring and weekly_insight were added. 
-- We ensure all known types are in the check.
alter table public.notifications add constraint notifications_type_check 
  check (type in (
    'lead_stale', 
    'follow_up_due', 
    'follow_up_overdue', 
    'general', 
    'weekly_insight', 
    'opportunity_expiring',
    'lead_resurrection'
  ));
