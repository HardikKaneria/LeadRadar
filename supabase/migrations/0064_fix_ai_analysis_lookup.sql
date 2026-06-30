-- Phase 7 · Bugfix
-- Fixes ai_analysis lookup in capture_knowledge_event_lead.
-- ai_analysis does not have a lead_id or opportunity_id column; it is keyed by discovery_id.

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
  -- ai_analysis is keyed by discovery_id, so we must join through opportunities
  select aa.* into v_ai_analysis
  from public.ai_analysis aa
  join public.opportunities o on aa.discovery_id = o.discovery_id
  where o.id = NEW.opportunity_id
  order by aa.created_at desc
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
