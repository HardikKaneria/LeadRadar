-- P9-06 · Scoring v3 groundwork
-- Adds RPC to find similar closed-won opportunities for AI scoring signals.

create or replace function public.find_similar_won_opportunities(
  p_org_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 3,
  p_match_threshold float default 0.70
)
returns table (
  id uuid,
  title text,
  status public.opportunity_status,
  score integer,
  potential_value numeric(14,2),
  heat_score numeric(6,2),
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(p_org_id, 'opportunities.read') then
    raise exception 'Permission denied';
  end if;

  return query
  select
    o.id,
    o.title,
    o.status,
    o.score,
    o.potential_value,
    o.heat_score,
    1 - (o.embedding <=> p_query_embedding) as similarity
  from public.opportunities o
  where o.organization_id = p_org_id
    and o.status = 'won'
    and o.deleted_at is null
    and o.embedding is not null
    and 1 - (o.embedding <=> p_query_embedding) > p_match_threshold
  order by similarity desc
  limit p_match_count;
end;
$$;
