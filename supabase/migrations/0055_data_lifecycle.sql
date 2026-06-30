-- Phase 9 · Data Lifecycle (P9-12)

-- 1. Add deleted_at for soft-deletes to core entities
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.discoveries ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Modify RLS policies to exclude soft-deleted rows by default
-- Leads
DROP POLICY IF EXISTS "Users can view their org leads" ON public.leads;
CREATE POLICY "Users can view their org leads"
  ON public.leads FOR SELECT
  TO authenticated
  USING (
    organization_id = (select auth.jwt() ->> 'org_id')::uuid
    AND deleted_at IS NULL
  );

-- Opportunities
DROP POLICY IF EXISTS "Users can view their org opportunities" ON public.opportunities;
CREATE POLICY "Users can view their org opportunities"
  ON public.opportunities FOR SELECT
  TO authenticated
  USING (
    organization_id = (select auth.jwt() ->> 'org_id')::uuid
    AND deleted_at IS NULL
  );

-- Discoveries
DROP POLICY IF EXISTS "Users can view their org discoveries" ON public.discoveries;
CREATE POLICY "Users can view their org discoveries"
  ON public.discoveries FOR SELECT
  TO authenticated
  USING (
    organization_id = (select auth.jwt() ->> 'org_id')::uuid
    AND deleted_at IS NULL
  );

-- 3. Hard delete org RPC
CREATE OR REPLACE FUNCTION public.hard_delete_organization(org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- We rely on CASCADE deletes defined in the schema to wipe everything (leads, opportunities, memberships).
  -- If some tables do not have ON DELETE CASCADE, they must be manually deleted here.
  
  -- Examples of manual cleanup if not cascaded:
  DELETE FROM public.job_runs WHERE organization_id = org_id;
  DELETE FROM public.ai_requests WHERE organization_id = org_id;
  DELETE FROM public.billing_events WHERE organization_id = org_id;

  -- Finally, delete the organization itself (which cascades to leads, etc.)
  DELETE FROM public.organizations WHERE id = org_id;
END;
$$;

-- 4. Check Usage Limit RPC
CREATE OR REPLACE FUNCTION public.check_usage_limit(
  p_org_id uuid,
  p_resource text,
  p_current_value integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limit integer;
BEGIN
  SELECT l.max_value INTO v_limit
  FROM public.billing_subscriptions s
  JOIN public.usage_limits l ON l.plan_id = s.plan_id
  WHERE s.organization_id = p_org_id AND s.status = 'active' AND l.resource_type = p_resource;

  IF NOT FOUND THEN
    -- If no subscription or no limit defined, allow by default (or fail if strict)
    RETURN true;
  END IF;

  RETURN p_current_value < v_limit;
END;
$$;

-- 5. Enforce active_leads limit in convert_discovery_to_opportunity
-- Drop existing to recreate with new logic
DROP FUNCTION IF EXISTS public.convert_discovery_to_opportunity(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.convert_discovery_to_opportunity(
  p_discovery uuid,
  p_owner uuid default null,
  p_force boolean default false
)
RETURNS public.opportunities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_discovery public.discoveries;
  v_analysis public.ai_analysis;
  v_plan public.ai_action_plans;
  v_threshold integer;
  v_priority text;
  v_weight smallint;
  v_heat numeric(6, 2);
  v_created public.opportunities;
  v_current_leads integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_discovery
  FROM public.discoveries
  WHERE id = p_discovery AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'discovery not found';
  END IF;

  v_org := v_discovery.organization_id;

  IF NOT public.has_permission(v_org, 'opportunities.write') THEN
    RAISE EXCEPTION 'insufficient permissions';
  END IF;

  IF v_discovery.status = 'converted' THEN
    RAISE EXCEPTION 'discovery already converted';
  END IF;

  -- 1. Check Usage Limit for active_leads
  SELECT COUNT(*) INTO v_current_leads FROM public.opportunities WHERE organization_id = v_org AND status IN ('new', 'working', 'negotiating');
  IF NOT public.check_usage_limit(v_org, 'active_leads', v_current_leads) THEN
    RAISE EXCEPTION 'USAGE_LIMIT_EXCEEDED: active_leads limit reached for this organization.';
  END IF;

  -- (rest of the original logic)
  -- The remainder is a copy of the original logic from 0020_opportunities.sql
  SELECT * INTO v_analysis FROM public.ai_analysis WHERE discovery_id = p_discovery ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_plan FROM public.ai_action_plans WHERE discovery_id = p_discovery ORDER BY created_at DESC LIMIT 1;
  
  v_threshold := coalesce((current_setting('app.settings.opportunity_threshold', true))::integer, 60);
  
  IF NOT p_force AND (v_analysis IS NULL OR v_analysis.score < v_threshold) THEN
    RAISE EXCEPTION 'discovery does not meet threshold for conversion';
  END IF;
  
  v_priority := coalesce(v_plan.recommended_priority, 'medium');
  v_weight := coalesce(v_plan.recommended_weight, 50);
  v_heat := coalesce(v_analysis.heat, 50.00);

  INSERT INTO public.opportunities (
    organization_id, discovery_id, status, title,
    ai_score_snapshot, heat_snapshot, priority_snapshot,
    weight_snapshot, owner_id
  ) VALUES (
    v_org, p_discovery, 'new', 
    v_discovery.company_name || ' Opportunity',
    coalesce(v_analysis.score, 0), v_heat, v_priority, v_weight,
    coalesce(p_owner, auth.uid())
  ) RETURNING * INTO v_created;

  UPDATE public.discoveries SET status = 'converted', updated_at = now() WHERE id = p_discovery;

  RETURN v_created;
END;
$$;
