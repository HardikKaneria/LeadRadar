-- Phase 4 · Bugfix
-- Revert log_activity to accept text for enums to avoid breaking existing triggers and RPCs
-- that pass string literals or text variables without explicit casts.

drop function if exists public.log_activity(uuid, public.relationship_node_type, uuid, public.activity_type, text, jsonb, uuid);

create or replace function public.log_activity(
  p_org         uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_type        text,
  p_summary     text,
  p_metadata    jsonb default null,
  p_actor       uuid default null
)
returns public.activities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.activities;
begin
  insert into public.activities (organization_id, entity_type, entity_id, type, summary, metadata, actor_id)
  values (
    p_org, p_entity_type::public.relationship_node_type, p_entity_id, p_type::public.activity_type,
    coalesce(nullif(trim(p_summary), ''), p_type),
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_actor, auth.uid())
  )
  returning * into v_row;
  return v_row;
end;
$$;
