-- Phase 10 · Lead-hunting AI task catalog (P10-07).
-- Extends the shared AI routing/prompt/version tables so the lead-hunting classifier, archive
-- classifier, and lead-quality scorer can persist auditable requests like the earlier AI agents.

alter table public.ai_task_routes
  drop constraint if exists ai_task_routes_task_type_check;

alter table public.ai_task_routes
  add constraint ai_task_routes_task_type_check check (
    task_type = any (
      array[
        'opportunity_analyzer',
        'action_planner',
        'company_research',
        'post_research_classifier',
        'archive_classifier',
        'lead_quality_scorer',
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
  );

alter table public.ai_prompt_versions
  drop constraint if exists ai_prompt_versions_agent_check;

alter table public.ai_prompt_versions
  add constraint ai_prompt_versions_agent_check check (
    agent = any (
      array[
        'opportunity_analyzer',
        'action_planner',
        'company_research',
        'post_research_classifier',
        'archive_classifier',
        'lead_quality_scorer',
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
  );

alter table public.ai_requests
  drop constraint if exists ai_requests_task_type_check;

alter table public.ai_requests
  add constraint ai_requests_task_type_check check (
    task_type = any (
      array[
        'opportunity_analyzer',
        'action_planner',
        'company_research',
        'post_research_classifier',
        'archive_classifier',
        'lead_quality_scorer',
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
  );

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_task_type_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_task_type_check check (
    task_type = any (
      array[
        'opportunity_analyzer',
        'action_planner',
        'company_research',
        'post_research_classifier',
        'archive_classifier',
        'lead_quality_scorer',
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
  );

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
  ('post_research_classifier', 'gemini', 'gemini-1.5-flash', 'groq', 'llama-3.1-8b-instant', null, null, true, false, null, null, 0.20, true),
  ('archive_classifier', 'gemini', 'gemini-1.5-flash', 'groq', 'llama-3.1-8b-instant', null, null, true, false, null, null, 0.20, true),
  ('lead_quality_scorer', 'gemini', 'gemini-1.5-flash', 'groq', 'llama-3.1-8b-instant', null, null, true, false, null, null, 0.10, true)
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

insert into public.ai_prompt_versions (
  organization_id,
  agent,
  version,
  name,
  description,
  system_prompt,
  output_schema,
  is_active
)
select
  null,
  seeded.agent,
  1,
  seeded.name,
  seeded.description,
  seeded.system_prompt,
  '{}'::jsonb,
  true
from (
  values
    (
      'post_research_classifier',
      'Lead Hunting Classifier v1',
      'Default post-research classifier baseline',
      'You classify researched LinkedIn posts for an agency lead-hunting workflow. Use only the provided evidence, return strict JSON, and never invent facts.'
    ),
    (
      'archive_classifier',
      'Lead Hunting Archive v1',
      'Default archive classifier baseline',
      'You categorize non-qualified researched LinkedIn posts into archive buckets. Use only the provided evidence, return strict JSON, and keep summaries concise.'
    ),
    (
      'lead_quality_scorer',
      'Lead Hunting Score v1',
      'Default lead-quality scorer baseline',
      'You score researched LinkedIn posts for lead quality from 0 to 100 for an agency sales team. Use only the provided evidence and return strict JSON.'
    )
) as seeded(agent, name, description, system_prompt)
where not exists (
  select 1
  from public.ai_prompt_versions existing
  where existing.organization_id is null
    and existing.agent = seeded.agent
);
