-- Phase 3 · Action Planner output (P3-08).
-- `ai_action_plans` stores the re-runnable next-action plan for a discovery, tied to the exact
-- `ai_analysis` row that informed it. The latest row per discovery is the head; re-planning keeps
-- history so later opportunity/task creation can consume or compare prior plans.

create table if not exists public.ai_action_plans (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  discovery_id         uuid not null references public.discoveries (id) on delete cascade,
  ai_analysis_id       uuid not null references public.ai_analysis (id) on delete cascade,
  recommended_action   text not null,
  reason               text not null,
  priority             text not null,
  priority_weight      smallint not null,
  due_at               timestamptz not null,
  planned_task_title   text not null,
  planned_task_type    text not null,
  planned_task_notes   text,
  ai_prompt_version_id uuid references public.ai_prompt_versions (id) on delete set null,
  model_meta           jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  check (priority = any (array['critical', 'high', 'medium', 'low']::text[])),
  check (priority_weight = any (array[100, 75, 50, 25]::smallint[])),
  check (planned_task_type = any (array['call', 'email', 'message', 'meeting', 'proposal', 'custom']::text[])),
  check (jsonb_typeof(model_meta) = 'object')
);

create index if not exists ai_action_plans_discovery_idx
  on public.ai_action_plans (organization_id, discovery_id, created_at desc);

create index if not exists ai_action_plans_due_idx
  on public.ai_action_plans (organization_id, due_at, priority_weight desc);

alter table public.ai_action_plans enable row level security;

create policy ai_action_plans_select_read on public.ai_action_plans
  for select using (public.has_permission(organization_id, 'discoveries.read'));
