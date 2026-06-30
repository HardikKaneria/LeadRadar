-- 0059 · Seed the 3 core billing plans + usage limits
-- Plans are upserted so re-running is safe.

-- ── Plans ──────────────────────────────────────────────────────────────────────
insert into public.billing_plans (id, name, slug, monthly_price, features)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Starter',
    'starter',
    0,
    '["Up to 100 AI analyses/month","5 team seats","500 discoveries","Basic lead scoring","Email support"]'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Growth',
    'growth',
    4900,
    '["Up to 1,000 AI analyses/month","15 team seats","5,000 discoveries","Advanced scoring & heat maps","Priority support","Opportunity pipeline"]'::jsonb
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'Scale',
    'scale',
    14900,
    '["Unlimited AI analyses","Unlimited seats","Unlimited discoveries","Custom scoring strategies","Dedicated support","API access","White-label options"]'::jsonb
  )
on conflict (slug) do update
  set name          = excluded.name,
      monthly_price = excluded.monthly_price,
      features      = excluded.features,
      updated_at    = now();

-- ── Usage limits ───────────────────────────────────────────────────────────────
-- resource_type values must match what checkUsageLimit() is called with in code.
-- -1 = unlimited (handled in billing.service.ts)

insert into public.usage_limits (plan_id, resource_type, max_value)
values
  -- Starter
  ('00000000-0000-0000-0000-000000000001', 'ai_requests',   100),
  ('00000000-0000-0000-0000-000000000001', 'seats',           5),
  ('00000000-0000-0000-0000-000000000001', 'discoveries',   500),
  ('00000000-0000-0000-0000-000000000001', 'opportunities', 100),
  -- Growth
  ('00000000-0000-0000-0000-000000000002', 'ai_requests',  1000),
  ('00000000-0000-0000-0000-000000000002', 'seats',          15),
  ('00000000-0000-0000-0000-000000000002', 'discoveries',  5000),
  ('00000000-0000-0000-0000-000000000002', 'opportunities', 1000),
  -- Scale — -1 = unlimited
  ('00000000-0000-0000-0000-000000000003', 'ai_requests',    -1),
  ('00000000-0000-0000-0000-000000000003', 'seats',          -1),
  ('00000000-0000-0000-0000-000000000003', 'discoveries',    -1),
  ('00000000-0000-0000-0000-000000000003', 'opportunities',  -1)
on conflict (plan_id, resource_type) do update
  set max_value  = excluded.max_value,
      updated_at = now();
