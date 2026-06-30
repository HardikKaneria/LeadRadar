-- Phase 3 · Scoring strategy v1 (P3-05).
-- Adds the org-scoped scoring_strategies table and seeds a default heuristic strategy so the
-- Opportunity Analyzer can blend deterministic signals with model output in the next task.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'scoring_strategy_kind') then
    create type public.scoring_strategy_kind as enum ('heuristic', 'statistical', 'ml');
  end if;
end
$$;

create table if not exists public.scoring_strategies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  version         integer not null,
  kind            public.scoring_strategy_kind not null default 'heuristic',
  weights         jsonb not null default '{}'::jsonb,
  metrics         jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (organization_id, version),
  check (version >= 1),
  check (jsonb_typeof(weights) = 'object'),
  check (jsonb_typeof(metrics) = 'object')
);

create unique index if not exists scoring_strategies_active_org_uidx
  on public.scoring_strategies (organization_id) where is_active;

create index if not exists scoring_strategies_org_created_idx
  on public.scoring_strategies (organization_id, created_at desc);

alter table public.scoring_strategies enable row level security;

create policy "scoring_strategies member read"
  on public.scoring_strategies
  for select using (public.is_member(organization_id));

create policy "scoring_strategies manage"
  on public.scoring_strategies
  for all using (public.has_permission(organization_id, 'company_brain.manage'))
  with check (public.has_permission(organization_id, 'company_brain.manage'));

insert into public.scoring_strategies (
  organization_id,
  version,
  kind,
  weights,
  metrics,
  is_active,
  created_by
)
select
  org.id,
  1,
  'heuristic',
  '{
    "serviceMatch": 25,
    "priorityServiceMatch": 20,
    "countryMatch": 10,
    "budgetFit": { "aboveMin": 10, "belowMin": -15, "unknown": 0 },
    "intent": { "high": 20, "medium": 10, "low": -10, "unclear": 0 },
    "urgency": { "urgent": 15, "soon": 8, "later": 3, "none": 0 }
  }'::jsonb,
  '{}'::jsonb,
  true,
  org.created_by
from public.organizations org
where not exists (
  select 1
  from public.scoring_strategies strategy
  where strategy.organization_id = org.id
    and strategy.is_active
);
