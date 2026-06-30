-- Phase 7: Knowledge Engine (P7-01)
-- Captures intelligence events when leads hit terminal states or engagement milestones.

create type public.knowledge_event_type as enum (
  'won',
  'lost',
  'on_hold',
  'no_response',
  'outreach_sent',
  'reply',
  'proposal_sent',
  'meeting_scheduled'
);

create table if not exists public.knowledge_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'opportunity')),
  entity_id uuid not null,
  event_type public.knowledge_event_type not null,
  reason text,
  source text,
  service_match text,
  country text,
  budget numeric(14, 2),
  score integer,
  value numeric(14, 2),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_events_org_type_idx
  on public.knowledge_events (organization_id, event_type);

create index if not exists knowledge_events_entity_idx
  on public.knowledge_events (entity_id);

-- RLS
alter table public.knowledge_events enable row level security;

create policy "Users can view knowledge events in their org"
  on public.knowledge_events for select
  using (
    organization_id = (select auth.jwt() ->> 'org_id')::uuid
    and public.has_permission(organization_id, 'leads.read')
  );

create policy "Service role has full access to knowledge events"
  on public.knowledge_events for all
  using (auth.role() = 'service_role');

-- Trigger function for capturing leads transitions
create or replace function public.capture_knowledge_event_lead()
returns trigger
language plpgsql
security definer
as $$
declare
  v_event_type public.knowledge_event_type;
  v_ai_analysis record;
  v_service_match text;
begin
  -- Only care about transitions TO a terminal state
  if NEW.stage = OLD.stage then
    return NEW;
  end if;

  if NEW.stage = 'won' then
    v_event_type := 'won';
  elsif NEW.stage = 'lost' then
    v_event_type := 'lost';
  elsif NEW.stage = 'on_hold' then
    v_event_type := 'on_hold';
  else
    return NEW; -- Not a knowledge capture event
  end if;

  -- Attempt to get the latest AI analysis for service_match
  select * into v_ai_analysis
  from public.ai_analysis
  where lead_id = NEW.id or opportunity_id = NEW.opportunity_id
  order by created_at desc
  limit 1;

  if v_ai_analysis.service_match is not null and jsonb_array_length(v_ai_analysis.service_match) > 0 then
    v_service_match := v_ai_analysis.service_match->>0;
  end if;

  insert into public.knowledge_events (
    organization_id,
    entity_type,
    entity_id,
    event_type,
    reason,
    source,
    service_match,
    country,
    budget,
    score,
    value,
    snapshot
  ) values (
    NEW.organization_id,
    'lead',
    NEW.id,
    v_event_type,
    NEW.close_reason,
    NEW.source,
    v_service_match,
    null, -- country is in company/contact, can be enriched later or if needed
    v_ai_analysis.budget_estimate,
    NEW.score,
    NEW.value,
    to_jsonb(NEW)
  );

  return NEW;
end;
$$;

create trigger capture_knowledge_event_lead_tg
  after update of stage on public.leads
  for each row
  execute function public.capture_knowledge_event_lead();


-- Trigger function for capturing outreach messages
create or replace function public.capture_knowledge_event_outreach()
returns trigger
language plpgsql
security definer
as $$
declare
  v_event_type public.knowledge_event_type;
  v_lead record;
begin
  if NEW.status != 'sent' then
    return NEW;
  end if;

  if NEW.direction = 'outbound' then
    v_event_type := 'outreach_sent';
  elsif NEW.direction = 'inbound' then
    v_event_type := 'reply';
  else
    return NEW;
  end if;

  -- Only trigger on INSERT or if status JUST changed to sent
  if TG_OP = 'UPDATE' and OLD.status = 'sent' then
    return NEW;
  end if;

  -- Get lead data
  select * into v_lead
  from public.leads
  where id = (select lead_id from public.conversations where id = NEW.conversation_id);

  if not found then
    return NEW;
  end if;

  insert into public.knowledge_events (
    organization_id,
    entity_type,
    entity_id,
    event_type,
    reason,
    source,
    service_match,
    score,
    value,
    snapshot
  ) values (
    NEW.organization_id,
    'lead',
    v_lead.id,
    v_event_type,
    null,
    v_lead.source,
    null,
    v_lead.score,
    v_lead.value,
    to_jsonb(v_lead) || jsonb_build_object('message_id', NEW.id, 'channel', NEW.channel)
  );

  return NEW;
end;
$$;

create trigger capture_knowledge_event_outreach_tg
  after insert or update of status on public.outreach_messages
  for each row
  execute function public.capture_knowledge_event_outreach();


-- Trigger function for capturing proposals
create or replace function public.capture_knowledge_event_proposal()
returns trigger
language plpgsql
security definer
as $$
declare
  v_event_type public.knowledge_event_type;
  v_lead record;
begin
  if NEW.status = 'sent' then
    v_event_type := 'proposal_sent';
  elsif NEW.status = 'accepted' then
    -- Wait, accepted proposal usually leads to won lead, we don't want duplicate events, but this is a specific proposal event
    v_event_type := 'won'; -- Maybe not use this, just track 'proposal_sent'
  else
    return NEW;
  end if;

  if TG_OP = 'UPDATE' and OLD.status = NEW.status then
    return NEW;
  end if;

  if v_event_type = 'won' then
    return NEW; -- Let the leads table handle the actual 'won' event when stage updates
  end if;

  select * into v_lead
  from public.leads
  where id = NEW.lead_id;

  insert into public.knowledge_events (
    organization_id,
    entity_type,
    entity_id,
    event_type,
    reason,
    source,
    service_match,
    score,
    value,
    snapshot
  ) values (
    NEW.organization_id,
    'lead',
    NEW.lead_id,
    v_event_type,
    null,
    v_lead.source,
    null,
    v_lead.score,
    v_lead.value,
    to_jsonb(v_lead) || jsonb_build_object('proposal_id', NEW.id)
  );

  return NEW;
end;
$$;

create trigger capture_knowledge_event_proposal_tg
  after update of status on public.proposals
  for each row
  execute function public.capture_knowledge_event_proposal();

