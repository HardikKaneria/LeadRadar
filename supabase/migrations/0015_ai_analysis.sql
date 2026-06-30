-- Phase 3 · Opportunity Analyzer output (P3-06).
-- `ai_analysis` is the re-runnable analyzer result for a discovery: an explainable score (from the
-- active scoring strategy), the AI-extracted semantic signals, the prompt version + strategy that
-- produced it, and provider/model metadata. Re-analysis keeps history (no unique constraint); the
-- latest row per discovery is the (organization_id, discovery_id, created_at desc) head.

create table if not exists public.ai_analysis (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete cascade,
  discovery_id          uuid not null references public.discoveries (id) on delete cascade,
  score                 integer not null,
  intent                text not null,
  urgency               text not null,
  service_match         jsonb not null default '[]'::jsonb,
  budget_estimate       numeric(14, 2),
  confidence            numeric(4, 3) not null default 0,
  recommended_action    text,
  reason                text,
  is_bad_lead           boolean not null default false,
  scoring_strategy_id   uuid references public.scoring_strategies (id) on delete set null,
  ai_prompt_version_id  uuid references public.ai_prompt_versions (id) on delete set null,
  model_meta            jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  check (score >= 0 and score <= 100),
  check (confidence >= 0 and confidence <= 1),
  check (intent = any (array['high', 'medium', 'low', 'unclear']::text[])),
  check (urgency = any (array['urgent', 'soon', 'later', 'none']::text[])),
  check (jsonb_typeof(service_match) = 'array'),
  check (jsonb_typeof(model_meta) = 'object')
);

create index if not exists ai_analysis_discovery_idx
  on public.ai_analysis (organization_id, discovery_id, created_at desc);

alter table public.ai_analysis enable row level security;

-- Members who can read discoveries can read their analyses; writes are service-role (the analyzer
-- runs in the thin API / worker), so there is no tenant insert/update policy.
create policy ai_analysis_select_read on public.ai_analysis
  for select using (public.has_permission(organization_id, 'discoveries.read'));
