-- P8-03 · QA: learning loop — DB-level strategy constraints and activation
-- The algorithmic recompute logic is covered by recompute-scoring.processor.spec.ts (Jest).
-- These pgTAP tests verify the Postgres-side guarantees the processor relies on.

begin;

select plan(20);

-- ──────────────────────────────────────────────────────────────────────────────
-- Fixtures
-- ──────────────────────────────────────────────────────────────────────────────

insert into public.organizations (id, name, slug)
values ('a1000000-0000-0000-0000-000000000001', 'LearningOrg', 'learningorg');

insert into auth.users (id, email)
values ('b1000000-0000-0000-0000-000000000001', 'admin@learning.test');

insert into public.organization_members (organization_id, user_id, role_slug)
values ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'company_admin');

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Seed strategy was auto-created by migration
-- ──────────────────────────────────────────────────────────────────────────────

-- The migration inserts a heuristic seed strategy per org; confirm it exists.
select is(
  (select count(*)::int from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'),
  1,
  'migration seed: one heuristic strategy exists per org'
);

select is(
  (select kind::text from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'),
  'heuristic',
  'migration seed: strategy kind is heuristic'
);

select is(
  (select is_active from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'),
  true,
  'migration seed: strategy is_active = true'
);

select is(
  (select version from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'),
  1,
  'migration seed: strategy version = 1'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Unique-per-version constraint
-- ──────────────────────────────────────────────────────────────────────────────

select throws_ok(
  $$insert into public.scoring_strategies
      (organization_id, version, kind, weights, metrics, is_active)
    values (
      'a1000000-0000-0000-0000-000000000001', 1, 'statistical', '{}', '{}', false
    )$$,
  '23505',
  null,
  'duplicate (org, version) is rejected'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Version >= 1 constraint
-- ──────────────────────────────────────────────────────────────────────────────

select throws_ok(
  $$insert into public.scoring_strategies
      (organization_id, version, kind, weights, metrics, is_active)
    values (
      'a1000000-0000-0000-0000-000000000001', 0, 'statistical', '{}', '{}', false
    )$$,
  '23514',
  null,
  'version < 1 is rejected by check constraint'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. weights / metrics must be JSON objects (not arrays/scalars)
-- ──────────────────────────────────────────────────────────────────────────────

select throws_ok(
  $$insert into public.scoring_strategies
      (organization_id, version, kind, weights, metrics, is_active)
    values (
      'a1000000-0000-0000-0000-000000000001', 99, 'statistical', '[]'::jsonb, '{}', false
    )$$,
  '23514',
  null,
  'weights as JSON array is rejected'
);

select throws_ok(
  $$insert into public.scoring_strategies
      (organization_id, version, kind, weights, metrics, is_active)
    values (
      'a1000000-0000-0000-0000-000000000001', 99, 'statistical', '{}', '[1,2]'::jsonb, false
    )$$,
  '23514',
  null,
  'metrics as JSON array is rejected'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Unique-active-per-org partial index
-- ──────────────────────────────────────────────────────────────────────────────

-- 5a. Inserting a second active strategy for same org is rejected.
select throws_ok(
  $$insert into public.scoring_strategies
      (organization_id, version, kind, weights, metrics, is_active)
    values (
      'a1000000-0000-0000-0000-000000000001', 2, 'statistical', '{}', '{}', true
    )$$,
  '23505',
  null,
  'two active strategies for same org violate the partial unique index'
);

-- 5b. Multiple inactive strategies for same org are allowed.
insert into public.scoring_strategies
  (organization_id, version, kind, weights, metrics, is_active)
values
  ('a1000000-0000-0000-0000-000000000001', 2, 'statistical', '{}', '{}', false),
  ('a1000000-0000-0000-0000-000000000001', 3, 'statistical', '{}', '{}', false);

select is(
  (select count(*)::int from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'
     and is_active = false),
  2,
  'multiple inactive strategies for same org are allowed'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Activation swap: deactivate old, activate new
-- ──────────────────────────────────────────────────────────────────────────────

-- Simulate what recompute-scoring does:
-- Step 1: deactivate current active
update public.scoring_strategies
  set is_active = false
  where organization_id = 'a1000000-0000-0000-0000-000000000001'
    and is_active = true;

-- Step 2: insert new active strategy (version 4)
insert into public.scoring_strategies
  (organization_id, version, kind, weights, metrics, is_active)
values (
  'a1000000-0000-0000-0000-000000000001',
  4,
  'statistical',
  '{"source.inbound": 2.5, "source.cold": 0.4}'::jsonb,
  '{"baselineWinRate": 0.4, "totalEvents": 20}'::jsonb,
  true
);

select is(
  (select count(*)::int from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'
     and is_active = true),
  1,
  'after activation swap: exactly one active strategy'
);

select is(
  (select version from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'
     and is_active = true),
  4,
  'after activation swap: active strategy is version 4'
);

select is(
  (select kind::text from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'
     and is_active = true),
  'statistical',
  'after activation swap: active strategy kind is statistical'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Weights are queryable as expected by the heat processor
-- ──────────────────────────────────────────────────────────────────────────────

select is(
  (select (weights->>'source.inbound')::numeric
   from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'
     and is_active = true),
  2.5,
  'weights jsonb field: source.inbound readable as numeric'
);

select is(
  (select (weights->>'source.cold')::numeric
   from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'
     and is_active = true),
  0.4,
  'weights jsonb field: source.cold readable as numeric'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 8. Org isolation: second org's strategies are independent
-- ──────────────────────────────────────────────────────────────────────────────

insert into public.organizations (id, name, slug)
values ('a1000000-0000-0000-0000-000000000002', 'OtherLearningOrg', 'otherlearningorg');

-- OtherLearningOrg gets its seed from migration — confirm it can have version 1 active
-- (and it doesn't conflict with LearningOrg's version 4 active strategy).
select is(
  (select count(*)::int from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000002'
     and is_active = true),
  1,
  'second org has its own independent active strategy'
);

-- Verify the active strategy in org 1 is unaffected by org 2
select is(
  (select version from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'
     and is_active = true),
  4,
  'org 1 active strategy unaffected by org 2 seed insert'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 9. Cascade: deleting org removes all its strategies
-- ──────────────────────────────────────────────────────────────────────────────

-- Count before
select is(
  (select count(*)::int from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'),
  4,  -- versions 1 (inactive), 2 (inactive), 3 (inactive), 4 (active)
  'org 1 has 4 strategy versions before deletion'
);

delete from public.organizations where id = 'a1000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.scoring_strategies
   where organization_id = 'a1000000-0000-0000-0000-000000000001'),
  0,
  'cascade delete: all strategies removed when org is deleted'
);

select * from finish();
rollback;
