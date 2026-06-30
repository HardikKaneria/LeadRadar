-- Lead resurrection matching RPC

CREATE TYPE public.resurrection_candidate AS (
  lead_id uuid,
  lead_title text,
  lead_status text,
  match_opportunity_id uuid,
  match_opportunity_title text,
  similarity numeric
);

CREATE OR REPLACE FUNCTION public.get_resurrection_candidates(
  p_organization_id uuid,
  p_days_back int DEFAULT 30,
  p_similarity_threshold float DEFAULT 0.15
)
RETURNS SETOF public.resurrection_candidate
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_opp record;
  v_threshold_date timestamptz := now() - (p_days_back || ' days')::interval;
BEGIN
  -- We want to find leads that are currently 'lost' or 'on_hold'
  -- and match them against opportunities created recently that have embeddings.
  FOR v_lead IN 
    SELECT l.id, l.title, l.status, o.embedding
    FROM public.leads l
    JOIN public.opportunities o ON l.opportunity_id = o.id
    WHERE l.organization_id = p_organization_id
      AND l.status IN ('lost', 'on_hold')
      AND o.embedding IS NOT NULL
  LOOP
    -- Find the single closest recent opportunity
    SELECT 
      id, 
      title, 
      (o.embedding <=> v_lead.embedding)::numeric as distance
    INTO v_opp
    FROM public.opportunities o
    WHERE o.organization_id = p_organization_id
      AND o.created_at >= v_threshold_date
      AND o.embedding IS NOT NULL
      AND o.status != 'archived'
      AND (o.embedding <=> v_lead.embedding) < p_similarity_threshold
    ORDER BY (o.embedding <=> v_lead.embedding) ASC
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT 
        v_lead.id,
        v_lead.title,
        v_lead.status,
        v_opp.id,
        v_opp.title,
        (1.0 - v_opp.distance) -- convert distance to similarity score
      ;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_resurrection_candidates(uuid, int, float) TO authenticated;
