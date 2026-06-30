-- Phase 3 · DB-backed AI task routing (P3-13).
-- Master-Admin-owned route rows override the in-code defaults in `packages/ai/src/routes.ts`.
-- Service-role callers read these directly; tenant clients have no policies on this table.

create table if not exists public.ai_task_routes (
  id                    uuid primary key default gen_random_uuid(),
  task_type             text not null,
  primary_provider      text not null,
  primary_model         text not null,
  fallback_provider     text,
  fallback_model        text,
  fallback_2_provider   text,
  fallback_2_model      text,
  requires_json_schema  boolean not null default false,
  requires_embedding    boolean not null default false,
  max_input_tokens      integer,
  max_output_tokens     integer,
  temperature           numeric(3, 2),
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (
    task_type = any (
      array[
        'opportunity_analyzer',
        'action_planner',
        'company_research',
        'sales_message',
        'follow_up_message',
        'conversation_summary',
        'proposal_generator',
        'meeting_prep',
        'next_action',
        'embedding',
        'learning_summary'
      ]::text[]
    )
  ),
  check (
    primary_provider = any (
      array['gemini', 'groq', 'openrouter', 'ollama', 'openai', 'anthropic']::text[]
    )
  ),
  check (
    fallback_provider is null
    or fallback_provider = any (
      array['gemini', 'groq', 'openrouter', 'ollama', 'openai', 'anthropic']::text[]
    )
  ),
  check (
    fallback_2_provider is null
    or fallback_2_provider = any (
      array['gemini', 'groq', 'openrouter', 'ollama', 'openai', 'anthropic']::text[]
    )
  ),
  check (
    (fallback_provider is null and fallback_model is null)
    or (fallback_provider is not null and fallback_model is not null)
  ),
  check (
    (fallback_2_provider is null and fallback_2_model is null)
    or (fallback_2_provider is not null and fallback_2_model is not null)
  ),
  check (max_input_tokens is null or max_input_tokens >= 0),
  check (max_output_tokens is null or max_output_tokens >= 0),
  check (temperature is null or (temperature >= 0 and temperature <= 2))
);

create unique index if not exists ai_task_routes_active_task_uidx
  on public.ai_task_routes (task_type) where is_active;

drop trigger if exists ai_task_routes_set_updated_at on public.ai_task_routes;
create trigger ai_task_routes_set_updated_at
  before update on public.ai_task_routes
  for each row execute function public.set_updated_at();

alter table public.ai_task_routes enable row level security;

insert into public.ai_task_routes (
  task_type,
  primary_provider,
  primary_model,
  fallback_provider,
  fallback_model,
  fallback_2_provider,
  fallback_2_model,
  requires_json_schema,
  requires_embedding,
  max_input_tokens,
  max_output_tokens,
  temperature,
  is_active
)
values
  ('opportunity_analyzer', 'gemini', 'gemini-1.5-flash', 'groq', 'llama-3.1-8b-instant', null, null, true,  false, null, null, 0.20, true),
  ('action_planner',       'groq',   'llama-3.1-8b-instant', 'gemini', 'gemini-1.5-flash', null, null, true,  false, null, null, 0.30, true),
  ('company_research',     'gemini', 'gemini-1.5-flash', 'groq', 'llama-3.1-8b-instant', null, null, false, false, null, null, 0.40, true),
  ('sales_message',        'gemini', 'gemini-1.5-flash', 'groq', 'llama-3.1-8b-instant', null, null, false, false, null, null, 0.70, true),
  ('follow_up_message',    'groq',   'llama-3.1-8b-instant', null, null, null, null, false, false, null, null, 0.70, true),
  ('conversation_summary', 'groq',   'llama-3.1-8b-instant', null, null, null, null, false, false, null, null, 0.20, true),
  ('proposal_generator',   'gemini', 'gemini-1.5-pro', 'gemini', 'gemini-1.5-flash', null, null, false, false, null, null, 0.50, true),
  ('meeting_prep',         'groq',   'llama-3.1-8b-instant', null, null, null, null, false, false, null, null, 0.40, true),
  ('next_action',          'groq',   'llama-3.1-8b-instant', null, null, null, null, true,  false, null, null, 0.20, true),
  ('embedding',            'gemini', 'text-embedding-004', null, null, null, null, false, true,  null, null, null, true),
  ('learning_summary',     'gemini', 'gemini-1.5-flash', 'groq', 'llama-3.1-8b-instant', null, null, false, false, null, null, 0.30, true)
on conflict (task_type) where (is_active) do update
set
  primary_provider = excluded.primary_provider,
  primary_model = excluded.primary_model,
  fallback_provider = excluded.fallback_provider,
  fallback_model = excluded.fallback_model,
  fallback_2_provider = excluded.fallback_2_provider,
  fallback_2_model = excluded.fallback_2_model,
  requires_json_schema = excluded.requires_json_schema,
  requires_embedding = excluded.requires_embedding,
  max_input_tokens = excluded.max_input_tokens,
  max_output_tokens = excluded.max_output_tokens,
  temperature = excluded.temperature,
  updated_at = now();
