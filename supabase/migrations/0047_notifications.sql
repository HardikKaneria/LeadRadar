-- Phase 5 · Notifications (P5-05)
-- Stale-lead detection & follow-up alerts

create table if not exists public.notification_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  notify_lead_stale boolean not null default true,
  notify_follow_up_due boolean not null default true,
  notify_follow_up_overdue boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  type             text not null check (type in ('lead_stale', 'follow_up_due', 'follow_up_overdue', 'general')),
  status           text not null default 'unread' check (status in ('unread', 'read')),
  data             jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, status, created_at desc);

-- RLS Policies
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

-- Users can manage their own preferences
create policy "Users can manage their own notification preferences"
  on public.notification_preferences
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can read/update their own notifications
create policy "Users can read own notifications"
  on public.notifications
  for select using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role bypasses RLS to insert notifications
