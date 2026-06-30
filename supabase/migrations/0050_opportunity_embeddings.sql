-- P9-02 · Similar opportunity finder & clustering
-- Adds embeddings to opportunities for similarity search (RAG) and surfacing past learnings.

alter table public.opportunities
  add column if not exists embedding vector(1536);

-- Index for cosine distance searches (like discoveries)
create index if not exists opportunities_embedding_ivfflat
  on public.opportunities using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RPC for finding similar opportunities
create or replace function public.find_similar_opportunities(
  p_org_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 5,
  p_match_threshold float default 0.75,
  p_exclude_id uuid default null
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
    and o.deleted_at is null
    and o.embedding is not null
    and (p_exclude_id is null or o.id != p_exclude_id)
    and 1 - (o.embedding <=> p_query_embedding) > p_match_threshold
  order by o.embedding <=> p_query_embedding
  limit p_match_count;
end;
$$;

-- Trigger to enqueue embedding generation
create or replace function public.trigger_enqueue_opportunity_embedding()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only enqueue if title or description changed, or on insert
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and (old.title is distinct from new.title or old.description is distinct from new.description or old.ai_explanation is distinct from new.ai_explanation)) then
    insert into public.job_runs (organization_id, queue_name, job_name, payload, status)
    values (
      new.organization_id,
      'generate-opportunity-embedding',
      'generate-opportunity-embedding',
      jsonb_build_object('opportunityId', new.id),
      'queued'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists opportunity_enqueue_embedding on public.opportunities;
create trigger opportunity_enqueue_embedding
  after insert or update on public.opportunities
  for each row
  execute function public.trigger_enqueue_opportunity_embedding();
