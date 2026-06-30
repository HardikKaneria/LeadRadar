-- Phase 5 · Follow-Up Intelligence (P5-02).
-- `tasks` are follow-up actions attached to leads. They power the queue views
-- (overdue/today/upcoming/assigned) and enforce the M10 invariant: **no active lead without an
-- open task**. The invariant is enforced three ways: (1) a trigger auto-creates an initial
-- follow-up when a lead is created or re-activated, (2) `complete_task`/`cancel_task` block closing
-- the last open task on an active lead unless an atomic follow-up is supplied, and (3) the
-- `active_leads_missing_open_task` checker function backs the periodic guard job (P5-06 / job wiring
-- is a follow-up — no scheduler substrate yet). Reads/writes are gated by `tasks.manage` (team) or
-- `tasks.manage_own` (own assignments). See docs/architecture/04-database-schema.md §M10.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('open', 'done', 'cancelled');
  end if;
end
$$;

create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  lead_id          uuid not null references public.leads (id) on delete cascade,
  title            text not null,
  description      text,
  status           public.task_status not null default 'open',
  priority         text not null default 'medium',
  priority_weight  smallint not null default 50,
  due_at           timestamptz,
  assigned_to      uuid references auth.users (id) on delete set null,
  completed_at     timestamptz,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  check (priority = any (array['critical', 'high', 'medium', 'low']::text[])),
  check (priority_weight = any (array[100, 75, 50, 25]::smallint[]))
);

-- Queue views: due-date ordering globally and per assignee; lead pane lookups.
create index if not exists tasks_status_due_idx
  on public.tasks (organization_id, status, due_at);
create index if not exists tasks_assignee_idx
  on public.tasks (organization_id, assigned_to, status, due_at);
create index if not exists tasks_lead_idx
  on public.tasks (organization_id, lead_id);
-- Fast invariant lookup: does this lead have an open task?
create index if not exists tasks_open_per_lead_idx
  on public.tasks (lead_id)
  where status = 'open' and deleted_at is null;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

-- Team managers see all org tasks; own-scoped members see only the tasks assigned to them.
create policy tasks_select on public.tasks
  for select using (
    public.has_permission(organization_id, 'tasks.manage')
    or (assigned_to = auth.uid() and public.has_permission(organization_id, 'tasks.manage_own'))
  );

create policy tasks_insert on public.tasks
  for insert with check (
    public.has_permission(organization_id, 'tasks.manage')
    or (assigned_to = auth.uid() and public.has_permission(organization_id, 'tasks.manage_own'))
  );

-- Direct UPDATE covers reschedule (due_at) + reassign (assigned_to). Completing/cancelling the last
-- open task on an active lead must go through the guarded RPCs below, not a direct status flip.
create policy tasks_update on public.tasks
  for update
  using (
    public.has_permission(organization_id, 'tasks.manage')
    or (assigned_to = auth.uid() and public.has_permission(organization_id, 'tasks.manage_own'))
  )
  with check (
    public.has_permission(organization_id, 'tasks.manage')
    or (assigned_to = auth.uid() and public.has_permission(organization_id, 'tasks.manage_own'))
  );

-- ── Invariant helpers ───────────────────────────────────────────────────────────────────────

create or replace function public.lead_stage_is_active(p_stage public.lead_stage)
returns boolean language sql immutable as $$
  select p_stage not in ('won', 'lost');
$$;

-- Auto-create an initial follow-up when a lead is created or moves back into an active stage and
-- has no open task. Keeps the "every active lead has an open task" invariant true by construction.
create or replace function public.ensure_lead_follow_up()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.deleted_at is null
     and public.lead_stage_is_active(NEW.stage)
     and not exists (
       select 1 from public.tasks
       where lead_id = NEW.id and status = 'open' and deleted_at is null
     )
  then
    insert into public.tasks (
      organization_id, lead_id, title, status, priority, priority_weight, due_at, assigned_to, created_by
    )
    values (
      NEW.organization_id, NEW.id, 'Follow up with lead', 'open',
      NEW.priority, NEW.priority_weight, now() + interval '1 day', NEW.owner_id, NEW.created_by
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists leads_ensure_follow_up on public.leads;
create trigger leads_ensure_follow_up
  after insert or update of stage on public.leads
  for each row execute function public.ensure_lead_follow_up();

-- ── Guarded mutations ───────────────────────────────────────────────────────────────────────

-- Complete a task. If it is the last open task on a still-active lead, an atomic follow-up must be
-- supplied (p_followup_title), otherwise the invariant would break and the call is rejected.
create or replace function public.complete_task(
  p_task uuid,
  p_followup_title text default null,
  p_followup_due_at timestamptz default null,
  p_followup_priority text default null,
  p_followup_assignee uuid default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_lead public.leads;
  v_open_remaining int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_task from public.tasks
  where id = p_task and deleted_at is null
  for update;
  if not found then
    raise exception 'task not found';
  end if;

  if not (
    public.has_permission(v_task.organization_id, 'tasks.manage')
    or (v_task.assigned_to = auth.uid() and public.has_permission(v_task.organization_id, 'tasks.manage_own'))
  ) then
    raise exception 'insufficient permissions';
  end if;

  if v_task.status <> 'open' then
    raise exception 'task is not open';
  end if;

  select * into v_lead from public.leads
  where id = v_task.lead_id and deleted_at is null;

  select count(*) into v_open_remaining from public.tasks
  where lead_id = v_task.lead_id and status = 'open' and deleted_at is null and id <> p_task;

  if v_lead.id is not null and public.lead_stage_is_active(v_lead.stage) and v_open_remaining = 0
     and (p_followup_title is null or btrim(p_followup_title) = '')
  then
    raise exception 'active lead requires an open follow-up task; supply a follow-up to complete this one';
  end if;

  update public.tasks
  set status = 'done', completed_at = now()
  where id = p_task
  returning * into v_task;

  if p_followup_title is not null and btrim(p_followup_title) <> '' then
    insert into public.tasks (
      organization_id, lead_id, title, status, priority, priority_weight, due_at, assigned_to, created_by
    )
    values (
      v_task.organization_id, v_task.lead_id, btrim(p_followup_title), 'open',
      coalesce(p_followup_priority, v_task.priority),
      case coalesce(p_followup_priority, v_task.priority)
        when 'critical' then 100 when 'high' then 75 when 'medium' then 50 else 25 end,
      coalesce(p_followup_due_at, now() + interval '1 day'),
      coalesce(p_followup_assignee, v_task.assigned_to),
      auth.uid()
    );
  end if;

  return v_task;
end;
$$;

-- Cancel a task with the same last-open-task guard as completion.
create or replace function public.cancel_task(
  p_task uuid,
  p_followup_title text default null,
  p_followup_due_at timestamptz default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task public.tasks;
  v_lead public.leads;
  v_open_remaining int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_task from public.tasks
  where id = p_task and deleted_at is null
  for update;
  if not found then
    raise exception 'task not found';
  end if;

  if not (
    public.has_permission(v_task.organization_id, 'tasks.manage')
    or (v_task.assigned_to = auth.uid() and public.has_permission(v_task.organization_id, 'tasks.manage_own'))
  ) then
    raise exception 'insufficient permissions';
  end if;

  if v_task.status <> 'open' then
    raise exception 'task is not open';
  end if;

  select * into v_lead from public.leads
  where id = v_task.lead_id and deleted_at is null;

  select count(*) into v_open_remaining from public.tasks
  where lead_id = v_task.lead_id and status = 'open' and deleted_at is null and id <> p_task;

  if v_lead.id is not null and public.lead_stage_is_active(v_lead.stage) and v_open_remaining = 0
     and (p_followup_title is null or btrim(p_followup_title) = '')
  then
    raise exception 'active lead requires an open follow-up task; supply a follow-up to cancel this one';
  end if;

  update public.tasks
  set status = 'cancelled'
  where id = p_task
  returning * into v_task;

  if p_followup_title is not null and btrim(p_followup_title) <> '' then
    insert into public.tasks (
      organization_id, lead_id, title, status, priority, priority_weight, due_at, assigned_to, created_by
    )
    values (
      v_task.organization_id, v_task.lead_id, btrim(p_followup_title), 'open',
      v_task.priority, v_task.priority_weight,
      coalesce(p_followup_due_at, now() + interval '1 day'),
      v_task.assigned_to, auth.uid()
    );
  end if;

  return v_task;
end;
$$;

-- Checker for the periodic guard job (P5-06): active, non-deleted leads that have drifted into
-- having no open task. The scheduled job that consumes this + re-creates tasks is a follow-up.
create or replace function public.active_leads_missing_open_task(p_org uuid)
returns setof public.leads
language sql
stable
security definer
set search_path = public
as $$
  select l.*
  from public.leads l
  where l.organization_id = p_org
    and l.deleted_at is null
    and public.lead_stage_is_active(l.stage)
    and not exists (
      select 1 from public.tasks t
      where t.lead_id = l.id and t.status = 'open' and t.deleted_at is null
    );
$$;
