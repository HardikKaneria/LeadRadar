-- Phase 3 · Prompt versioning (P3-03).
-- Versioned, auditable prompts: system defaults (organization_id is null) + org custom overrides.
-- The gateway resolves the active version per (agent, org) and stamps `ai_prompt_version_id` on
-- every `ai_request`. System defaults are platform-owned (service-role); org custom prompts are
-- managed by members with `ai.settings.manage`. See docs/architecture/04-database-schema.md §4.8
-- and 09-ai-workflow.md §9.1.

create table if not exists public.ai_prompt_versions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid references public.organizations (id) on delete cascade,
  agent                 text not null,
  version               integer not null,
  name                  text not null,
  description           text,
  system_prompt         text not null,
  user_prompt_template  text,
  output_schema         jsonb not null default '{}'::jsonb,
  model_preferences     jsonb not null default '{}'::jsonb,
  is_active             boolean not null default true,
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (version >= 1),
  check (jsonb_typeof(output_schema) = 'object'),
  check (jsonb_typeof(model_preferences) = 'object'),
  check (
    agent = any (
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
  )
);

-- One active version per scope: org-custom rows are unique per (org, agent); system defaults
-- (organization_id is null) are unique per (agent).
create unique index if not exists ai_prompt_versions_active_org_uidx
  on public.ai_prompt_versions (organization_id, agent)
  where is_active and organization_id is not null;
create unique index if not exists ai_prompt_versions_active_system_uidx
  on public.ai_prompt_versions (agent)
  where is_active and organization_id is null;

-- Stable version numbers per scope.
create unique index if not exists ai_prompt_versions_org_version_uidx
  on public.ai_prompt_versions (organization_id, agent, version)
  where organization_id is not null;
create unique index if not exists ai_prompt_versions_system_version_uidx
  on public.ai_prompt_versions (agent, version)
  where organization_id is null;

create index if not exists ai_prompt_versions_org_agent_idx
  on public.ai_prompt_versions (organization_id, agent, version desc);

drop trigger if exists ai_prompt_versions_set_updated_at on public.ai_prompt_versions;
create trigger ai_prompt_versions_set_updated_at
  before update on public.ai_prompt_versions
  for each row execute function public.set_updated_at();

alter table public.ai_prompt_versions enable row level security;

-- Members read their org's prompts plus the shared system defaults; the gateway falls back to a
-- system default when an org has no custom version.
create policy "ai_prompt_versions read"
  on public.ai_prompt_versions
  for select using (organization_id is null or public.is_member(organization_id));

-- Only `ai.settings.manage` members may directly mutate org-custom rows. System defaults
-- (organization_id is null) have no tenant write policy — they are service-role/Master-Admin only.
create policy "ai_prompt_versions manage"
  on public.ai_prompt_versions
  for all
  using (organization_id is not null and public.has_permission(organization_id, 'ai.settings.manage'))
  with check (organization_id is not null and public.has_permission(organization_id, 'ai.settings.manage'));

-- Harden the deferred seam left by 0012: link the request log to the resolved prompt version.
-- Kept nullable (ON DELETE SET NULL) because embeddings and env-fallback calls may resolve no
-- version; full not-null hardening waits until every agent always resolves a version.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_requests_ai_prompt_version_id_fkey'
  ) then
    alter table public.ai_requests
      add constraint ai_requests_ai_prompt_version_id_fkey
      foreign key (ai_prompt_version_id)
      references public.ai_prompt_versions (id)
      on delete set null;
  end if;
end
$$;

create index if not exists ai_requests_prompt_version_idx
  on public.ai_requests (ai_prompt_version_id)
  where ai_prompt_version_id is not null;

-- Create a new prompt version in a scope, optionally activating it (atomically deactivating the
-- previous active version). org = null targets a platform system default (service-role only).
create or replace function public.create_ai_prompt_version(
  org uuid,
  p_agent text,
  p_name text,
  p_system_prompt text,
  p_description text default null,
  p_user_prompt_template text default null,
  p_output_schema jsonb default '{}'::jsonb,
  p_model_preferences jsonb default '{}'::jsonb,
  p_activate boolean default true
)
returns public.ai_prompt_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
  created_row public.ai_prompt_versions;
begin
  if org is null then
    if auth.role() <> 'service_role' then
      raise exception 'system prompt defaults are platform-managed';
    end if;
  else
    if auth.uid() is null then
      raise exception 'not authenticated';
    end if;
    if not public.has_permission(org, 'ai.settings.manage') then
      raise exception 'insufficient permissions';
    end if;
  end if;

  select coalesce(max(version), 0) + 1
  into next_version
  from public.ai_prompt_versions
  where organization_id is not distinct from org
    and agent = p_agent;

  if p_activate then
    update public.ai_prompt_versions
    set is_active = false
    where organization_id is not distinct from org
      and agent = p_agent
      and is_active = true;
  end if;

  insert into public.ai_prompt_versions (
    organization_id,
    agent,
    version,
    name,
    description,
    system_prompt,
    user_prompt_template,
    output_schema,
    model_preferences,
    is_active,
    created_by
  )
  values (
    org,
    p_agent,
    next_version,
    p_name,
    nullif(trim(coalesce(p_description, '')), ''),
    p_system_prompt,
    p_user_prompt_template,
    coalesce(p_output_schema, '{}'::jsonb),
    coalesce(p_model_preferences, '{}'::jsonb),
    coalesce(p_activate, true),
    auth.uid()
  )
  returning * into created_row;

  return created_row;
end;
$$;

-- Activate a specific version, deactivating the current active version in the same scope.
create or replace function public.activate_ai_prompt_version(p_id uuid)
returns public.ai_prompt_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.ai_prompt_versions;
  updated_row public.ai_prompt_versions;
begin
  select * into target from public.ai_prompt_versions where id = p_id for update;
  if not found then
    raise exception 'prompt version not found';
  end if;

  if target.organization_id is null then
    if auth.role() <> 'service_role' then
      raise exception 'system prompt defaults are platform-managed';
    end if;
  else
    if auth.uid() is null then
      raise exception 'not authenticated';
    end if;
    if not public.has_permission(target.organization_id, 'ai.settings.manage') then
      raise exception 'insufficient permissions';
    end if;
  end if;

  update public.ai_prompt_versions
  set is_active = false
  where organization_id is not distinct from target.organization_id
    and agent = target.agent
    and is_active = true
    and id <> p_id;

  update public.ai_prompt_versions
  set is_active = true
  where id = p_id
  returning * into updated_row;

  return updated_row;
end;
$$;

-- Seed a system default (organization_id null) for every agent so the gateway can always resolve
-- and stamp a prompt version. These are intentionally generic baselines; richer per-agent prompts
-- (e.g. the Opportunity Analyzer) layer on as new active versions in later AI tasks.
insert into public.ai_prompt_versions (organization_id, agent, version, name, description, system_prompt, is_active)
select null, v.agent, 1, v.name, v.description, v.system_prompt, true
from (
  values
    ('opportunity_analyzer', 'Opportunity Analyzer v1', 'Default analyzer prompt baseline',
     'You are an opportunity analyst for an agency. Given a discovered opportunity and the company''s targeting profile, assess fit, intent, budget, and urgency, and recommend the next best action. Be precise, evidence-based, and concise.'),
    ('action_planner', 'Action Planner v1', 'Default action-planner prompt baseline',
     'You plan the highest-leverage next actions to convert an opportunity into revenue. Prioritise by likely impact and effort, and be specific and actionable.'),
    ('company_research', 'Company Research v1', 'Default company-research prompt baseline',
     'You research a company to support outreach. Summarise what they do, likely needs, and relevant signals. Only use the provided context; never invent facts.'),
    ('sales_message', 'Sales Message v1', 'Default sales-message prompt baseline',
     'You write concise, personalised first-touch sales messages. Lead with relevance, keep it short, and propose one clear next step. No hype.'),
    ('follow_up_message', 'Follow-up Message v1', 'Default follow-up prompt baseline',
     'You write brief, helpful follow-up messages that add value and gently move the conversation forward without being pushy.'),
    ('conversation_summary', 'Conversation Summary v1', 'Default conversation-summary prompt baseline',
     'You summarise a sales conversation into key points, decisions, and open follow-ups. Be faithful to the transcript and concise.'),
    ('proposal_generator', 'Proposal Generator v1', 'Default proposal prompt baseline',
     'You draft a tailored proposal from the opportunity context and company profile: scope, approach, and value. Be clear, specific, and grounded in the provided context.'),
    ('meeting_prep', 'Meeting Prep v1', 'Default meeting-prep prompt baseline',
     'You prepare a concise briefing for an upcoming meeting: who, context, goals, talking points, and likely objections.'),
    ('next_action', 'Next Action v1', 'Default next-action prompt baseline',
     'You recommend the single best next action for an opportunity, with a short rationale. Be decisive and practical.'),
    ('embedding', 'Embedding v1', 'Default embedding baseline (no system prompt needed)',
     'Embedding task: no system prompt is applied; this row exists so embedding calls still reference an auditable prompt version.'),
    ('learning_summary', 'Learning Summary v1', 'Default learning-summary prompt baseline',
     'You summarise outcomes and learnings across opportunities to improve future targeting and messaging. Be objective and specific.')
) as v(agent, name, description, system_prompt)
where not exists (
  select 1
  from public.ai_prompt_versions existing
  where existing.organization_id is null
    and existing.agent = v.agent
);
