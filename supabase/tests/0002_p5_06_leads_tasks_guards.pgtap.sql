-- P5-06 pgTAP tests: promote_opportunity_to_lead idempotency, close_lead won/lost gate,
-- ensure_lead_follow_up trigger, complete_task / cancel_task last-open-task guard.
--
-- Run with: pnpm dlx supabase test db (requires supabase CLI with live local instance).

begin;

select plan(19);

-- ── Setup ────────────────────────────────────────────────────────────────────

insert into public.organizations (id, organization_name, slug)
values ('00000000-0000-0000-0000-000000000002', 'Guard Test Org', 'guard-test-pgtap')
on conflict (id) do nothing;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000098', 'guard@test.internal')
on conflict (id) do nothing;

insert into public.roles (user_id, organization_id, role_slug)
values ('00000000-0000-0000-0000-000000000098', '00000000-0000-0000-0000-000000000002', 'company_admin')
on conflict do nothing;

perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000098"}', true);

-- Seed a discovery + analysis (score=80) + opportunity to promote from.
insert into public.discoveries (id, organization_id, title, source, raw_data, status, created_by)
values (
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000002',
  'Promotable discovery', 'manual', '{}', 'analyzed', '00000000-0000-0000-0000-000000000098'
) on conflict (id) do nothing;

insert into public.ai_analysis (discovery_id, organization_id, score, is_bad_lead, summary, created_by)
values (
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000002',
  80, false, 'Promotable', '00000000-0000-0000-0000-000000000098'
) on conflict do nothing;

-- Convert discovery → opportunity so we have an opportunity to promote.
select lives_ok(
  $$select public.convert_discovery_to_opportunity('00000000-0000-0000-0000-000000000050')$$,
  'setup: convert discovery to opportunity should succeed'
);

-- ── 1. promote_opportunity_to_lead idempotency ────────────────────────────────

-- Store the opportunity ID.
do $$
declare v_opp_id uuid;
begin
  select id into v_opp_id from public.opportunities
  where discovery_id = '00000000-0000-0000-0000-000000000050' limit 1;

  -- First promotion should succeed.
  perform public.promote_opportunity_to_lead(v_opp_id);

  -- Second promotion of the same opportunity must throw.
  begin
    perform public.promote_opportunity_to_lead(v_opp_id);
    perform ok(false, 'second promote should have raised');
  exception
    when others then
      perform ok(true, 'promote_opportunity_to_lead: idempotency guard fires on second call');
  end;
end;
$$;

-- Verify only one lead was created.
select is(
  (select count(*)::int from public.leads
   where organization_id = '00000000-0000-0000-0000-000000000002'),
  1,
  'promote_opportunity_to_lead: exactly one lead row despite double-call attempt'
);

-- ── 2. ensure_lead_follow_up trigger ─────────────────────────────────────────

-- A new active-stage lead should auto-create one follow-up task.
select is(
  (select count(*)::int from public.tasks t
   join public.leads l on l.id = t.lead_id
   where l.organization_id = '00000000-0000-0000-0000-000000000002'
     and t.status = 'open'
     and t.deleted_at is null),
  1,
  'ensure_lead_follow_up trigger: auto-created one open task for the new lead'
);

-- ── 3. close_lead won/lost gate ────────────────────────────────────────────────

-- Capture lead ID.
do $$
declare v_lead_id uuid;
begin
  select id into v_lead_id from public.leads
  where organization_id = '00000000-0000-0000-0000-000000000002' limit 1;

  -- Invalid outcome should raise.
  begin
    perform public.close_lead(v_lead_id, 'maybe');
    perform ok(false, 'close_lead: invalid outcome should have raised');
  exception
    when others then
      perform ok(true, 'close_lead: invalid outcome rejects with error');
  end;

  -- Valid outcome 'won' should succeed.
  perform public.close_lead(v_lead_id, 'won', 'Great deal');
  perform ok(true, 'close_lead: won outcome succeeds');
end;
$$;

select is(
  (select stage::text from public.leads
   where organization_id = '00000000-0000-0000-0000-000000000002' limit 1),
  'won',
  'close_lead: lead stage set to won'
);

select is(
  (select close_reason from public.leads
   where organization_id = '00000000-0000-0000-0000-000000000002' limit 1),
  'Great deal',
  'close_lead: close_reason stored'
);

select isnt(
  (select closed_at from public.leads
   where organization_id = '00000000-0000-0000-0000-000000000002' limit 1),
  null,
  'close_lead: closed_at set'
);

-- ── 4. complete_task last-open-task guard ──────────────────────────────────────

-- Create a new active lead + one task to test the guard.
insert into public.leads (id, organization_id, title, stage, priority, priority_weight, created_by)
values (
  '00000000-0000-0000-0000-000000000060',
  '00000000-0000-0000-0000-000000000002',
  'Guard test lead', 'contacted', 'high', 75, '00000000-0000-0000-0000-000000000098'
) on conflict (id) do nothing;

insert into public.tasks (id, organization_id, lead_id, title, status, priority, priority_weight, created_by)
values (
  '00000000-0000-0000-0000-000000000070',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000060',
  'Last open task', 'open', 'high', 75, '00000000-0000-0000-0000-000000000098'
) on conflict (id) do nothing;

-- Completing last task without follow-up should be rejected.
select throws_ok(
  $$select public.complete_task('00000000-0000-0000-0000-000000000070')$$,
  'P0001',
  null,
  'complete_task: last-open-task guard fires when no follow-up supplied'
);

-- Completing with a follow-up title should succeed.
select lives_ok(
  $$select public.complete_task('00000000-0000-0000-0000-000000000070', 'Follow-up call')$$,
  'complete_task: succeeds when follow-up title is provided'
);

-- Old task should be done, new follow-up task should be open.
select is(
  (select status::text from public.tasks where id = '00000000-0000-0000-0000-000000000070'),
  'done',
  'complete_task: completed task status = done'
);

select is(
  (select count(*)::int from public.tasks
   where lead_id = '00000000-0000-0000-0000-000000000060' and status = 'open' and deleted_at is null),
  1,
  'complete_task: exactly one open follow-up task remains after completion'
);

-- ── 5. cancel_task last-open-task guard ───────────────────────────────────────

-- The follow-up we just created is now the single open task.
do $$
declare v_task_id uuid;
begin
  select id into v_task_id from public.tasks
  where lead_id = '00000000-0000-0000-0000-000000000060' and status = 'open' and deleted_at is null
  limit 1;

  -- Cancel without follow-up should fail.
  begin
    perform public.cancel_task(v_task_id);
    perform ok(false, 'cancel_task: guard should have raised');
  exception
    when others then
      perform ok(true, 'cancel_task: last-open-task guard fires correctly');
  end;

  -- Cancel with follow-up should succeed.
  perform public.cancel_task(v_task_id, 'Rescheduled follow-up');
  perform ok(true, 'cancel_task: succeeds with follow-up supplied');
end;
$$;

select is(
  (select count(*)::int from public.tasks
   where lead_id = '00000000-0000-0000-0000-000000000060' and status = 'open' and deleted_at is null),
  1,
  'cancel_task: one open replacement task still exists after cancel'
);

-- ── Finish ────────────────────────────────────────────────────────────────────

select * from finish();

rollback;
