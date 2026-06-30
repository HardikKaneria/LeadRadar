-- Allow force-override of bad-lead flag in convert_discovery_to_opportunity.
-- When p_force is true the bad-lead check is skipped so company admins can
-- manually approve a flagged discovery after reviewing it.

create or replace function public.convert_discovery_to_opportunity(
  p_discovery uuid,
  p_owner uuid default null,
  p_force boolean default false
)
returns public.opportunities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_discovery public.discoveries;
  v_analysis public.ai_analysis;
  v_plan public.ai_action_plans;
  v_threshold integer;
  v_priority text;
  v_weight smallint;
  v_heat numeric(6, 2);
  v_created public.opportunities;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_discovery
  from public.discoveries
  where id = p_discovery and deleted_at is null
  for update;

  if not found then
    raise exception 'discovery not found';
  end if;

  v_org := v_discovery.organization_id;

  if not public.has_permission(v_org, 'opportunities.write') then
    raise exception 'insufficient permissions';
  end if;

  if v_discovery.status = 'converted' then
    raise exception 'discovery already converted';
  end if;

  select * into v_analysis
  from public.ai_analysis
  where discovery_id = p_discovery
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'discovery has no analysis; analyze it first';
  end if;

  -- Only block bad leads when not forcing
  if v_analysis.is_bad_lead and not p_force then
    raise exception 'discovery is flagged as a bad lead';
  end if;

  select coalesce((settings ->> 'scoreThreshold')::int, 60)
  into v_threshold
  from public.organizations
  where id = v_org;
  v_threshold := coalesce(v_threshold, 60);

  if not p_force and v_analysis.score < v_threshold then
    raise exception 'score % is below the approval threshold %', v_analysis.score, v_threshold;
  end if;

  select * into v_plan
  from public.ai_action_plans
  where discovery_id = p_discovery
  order by created_at desc
  limit 1;

  if found then
    v_priority := v_plan.priority;
    v_weight := v_plan.priority_weight;
  elsif v_analysis.score >= 80 then
    v_priority := 'critical'; v_weight := 100;
  elsif v_analysis.score >= 60 then
    v_priority := 'high'; v_weight := 75;
  elsif v_analysis.score >= 40 then
    v_priority := 'medium'; v_weight := 50;
  else
    v_priority := 'low'; v_weight := 25;
  end if;

  v_heat := round(least(100, v_analysis.score * 0.7 + v_weight * 0.3)::numeric, 2);

  insert into public.opportunities (
    organization_id,
    discovery_id,
    title,
    description,
    status,
    score,
    priority,
    priority_weight,
    potential_value,
    heat_score,
    recommended_action,
    ai_explanation,
    owner_id,
    created_by
  )
  values (
    v_org,
    p_discovery,
    coalesce(nullif(trim(coalesce(v_discovery.title, '')), ''), v_discovery.company_name, 'Untitled opportunity'),
    v_discovery.description,
    'open',
    v_analysis.score,
    v_priority,
    v_weight,
    v_analysis.budget_estimate,
    v_heat,
    coalesce(v_plan.recommended_action, v_analysis.recommended_action),
    v_analysis.reason,
    coalesce(p_owner, auth.uid()),
    auth.uid()
  )
  returning * into v_created;

  update public.discoveries
  set status = 'converted'
  where id = p_discovery;

  return v_created;
end;
$$;
