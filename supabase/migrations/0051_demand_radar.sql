-- Demand radar clustering RPC

CREATE TYPE public.demand_radar_cluster AS (
  cluster_id uuid,
  title text,
  volume int,
  velocity numeric,
  avg_score numeric
);

CREATE OR REPLACE FUNCTION public.get_demand_radar(
  p_organization_id uuid,
  p_days_back int DEFAULT 30,
  p_similarity_threshold float DEFAULT 0.15
)
RETURNS SETOF public.demand_radar_cluster
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp record;
  v_assigned boolean;
  v_half_days int := p_days_back / 2;
  v_threshold_date timestamptz := now() - (p_days_back || ' days')::interval;
  v_mid_date timestamptz := now() - (v_half_days || ' days')::interval;
  v_match_cluster_id uuid;
BEGIN
  -- We'll use a temporary table to build clusters
  CREATE TEMP TABLE IF NOT EXISTS tmp_clusters (
    cluster_id uuid,
    title text,
    embedding vector(1536),
    volume int DEFAULT 0,
    volume_first_half int DEFAULT 0,
    volume_second_half int DEFAULT 0,
    total_score numeric DEFAULT 0
  ) ON COMMIT DROP;
  
  -- Clear for current run (in case the session is reused)
  TRUNCATE tmp_clusters;

  FOR v_opp IN 
    SELECT id, title, embedding, score, created_at
    FROM public.opportunities
    WHERE organization_id = p_organization_id
      AND created_at >= v_threshold_date
      AND embedding IS NOT NULL
      AND status != 'archived'
    ORDER BY score DESC NULLS LAST
  LOOP
    v_assigned := false;
    
    -- Try to find an existing cluster within threshold
    SELECT cluster_id INTO v_match_cluster_id
    FROM tmp_clusters
    WHERE (tmp_clusters.embedding <=> v_opp.embedding) < p_similarity_threshold
    ORDER BY (tmp_clusters.embedding <=> v_opp.embedding) ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE tmp_clusters 
      SET volume = volume + 1,
          volume_first_half = volume_first_half + CASE WHEN v_opp.created_at < v_mid_date THEN 1 ELSE 0 END,
          volume_second_half = volume_second_half + CASE WHEN v_opp.created_at >= v_mid_date THEN 1 ELSE 0 END,
          total_score = total_score + COALESCE(v_opp.score, 0)
      WHERE cluster_id = v_match_cluster_id;
      v_assigned := true;
    END IF;

    IF NOT v_assigned THEN
      -- Create new cluster
      INSERT INTO tmp_clusters (cluster_id, title, embedding, volume, volume_first_half, volume_second_half, total_score)
      VALUES (
        v_opp.id, 
        v_opp.title, 
        v_opp.embedding, 
        1,
        CASE WHEN v_opp.created_at < v_mid_date THEN 1 ELSE 0 END,
        CASE WHEN v_opp.created_at >= v_mid_date THEN 1 ELSE 0 END,
        COALESCE(v_opp.score, 0)
      );
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT 
    c.cluster_id,
    c.title,
    c.volume,
    -- Velocity: If first half is 0, just use second half as velocity. Otherwise, (second - first) / first
    CASE 
      WHEN c.volume_first_half = 0 THEN (c.volume_second_half * 100.0)::numeric
      ELSE ((c.volume_second_half - c.volume_first_half)::numeric / c.volume_first_half::numeric) * 100.0
    END as velocity,
    (c.total_score / c.volume)::numeric as avg_score
  FROM tmp_clusters c
  WHERE c.volume >= 2 -- Only return actual clusters
  ORDER BY c.volume DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_demand_radar(uuid, int, float) TO authenticated;
