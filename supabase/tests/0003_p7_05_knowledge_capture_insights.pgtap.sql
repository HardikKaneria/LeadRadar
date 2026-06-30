-- P7-05 · QA: knowledge capture + insights
-- Tests outcome→event correctness, feature snapshot integrity, and insight aggregation.

begin;

select plan(32);

-- ──────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ──────────────────────────────────────────────────────────────────────────────

-- Org + user fixtures
insert into public.organizations (id, name, slug)
values ('a0000000-0000-0000-0000-000000000001', 'KnowledgeOrg', 'knowledgeorg');

insert into auth.users (id, email)
values ('b0000000-0000-0000-0000-000000000001', 'agent@knowledge.test');

insert into public.organization_members (organization_id, user_id, role_slug)
values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'company_admin');

-- Insert a lead in active stage so we can transition it
insert into public.leads (
  id, organization_id, title, source, stage, score
) values (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Test Lead Alpha', 'website', 'negotiation', 80
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Lead stage → knowledge_event (terminal transitions)
-- ──────────────────────────────────────────────────────────────────────────────

-- 1a. Transition lead to 'won' → captures a 'won' event
update public.leads
  set stage = 'won', close_reason = 'Great fit'
  where id = 'c0000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000001'
     and event_type = 'won'),
  1,
  'lead→won transition fires one won knowledge_event'
);

select is(
  (select reason from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000001'
     and event_type = 'won'),
  'Great fit',
  'knowledge_event carries close_reason'
);

select is(
  (select score from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000001'
     and event_type = 'won'),
  80,
  'knowledge_event copies score from lead'
);

select is(
  (select source from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000001'
     and event_type = 'won'),
  'website',
  'knowledge_event copies source from lead'
);

-- 1b. Snapshot integrity: snapshot contains the lead's id field
select ok(
  (select (snapshot->>'id') = 'c0000000-0000-0000-0000-000000000001'
   from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000001'
     and event_type = 'won'),
  'knowledge_event snapshot contains lead id'
);

select ok(
  (select (snapshot->>'stage') is not null
   from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000001'
     and event_type = 'won'),
  'knowledge_event snapshot is non-empty jsonb of lead row'
);

-- 1c. Idempotency: updating a non-terminal field does NOT add another event
update public.leads set score = 85
  where id = 'c0000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000001'),
  1,
  'non-stage update does not fire an additional knowledge_event'
);

-- 1d. Insert a fresh lead and transition to 'lost'
insert into public.leads (
  id, organization_id, title, source, stage, score
) values (
  'c0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'Test Lead Beta', 'linkedin', 'proposal_sent', 55
);

update public.leads
  set stage = 'lost', close_reason = 'Price too high'
  where id = 'c0000000-0000-0000-0000-000000000002';

select is(
  (select event_type::text from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000002'),
  'lost',
  'lead→lost transition captures lost event'
);

-- 1e. Transition to 'on_hold'
insert into public.leads (
  id, organization_id, title, source, stage, score
) values (
  'c0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'Test Lead Gamma', 'referral', 'contacted', 40
);

update public.leads
  set stage = 'on_hold'
  where id = 'c0000000-0000-0000-0000-000000000003';

select is(
  (select event_type::text from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000003'),
  'on_hold',
  'lead→on_hold transition captures on_hold event'
);

-- 1f. Non-terminal transition does NOT produce an event
insert into public.leads (
  id, organization_id, title, source, stage, score
) values (
  'c0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'Test Lead Delta', 'cold_email', 'new', 30
);

update public.leads
  set stage = 'contacted'
  where id = 'c0000000-0000-0000-0000-000000000004';

select is(
  (select count(*)::int from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000004'),
  0,
  'new→contacted (non-terminal) does not produce a knowledge_event'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Outreach trigger → knowledge_event
-- ──────────────────────────────────────────────────────────────────────────────

-- Need a conversation for the outreach message
insert into public.conversations (
  id, organization_id, lead_id, channel, status
) values (
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000004',
  'email', 'open'
);

-- 2a. Outbound sent → outreach_sent event
insert into public.outreach_messages (
  id, organization_id, conversation_id, channel, direction, status, body
) values (
  'e0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'email', 'outbound', 'sent', 'Hi there!'
);

select is(
  (select event_type::text from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000004'
     and event_type = 'outreach_sent'),
  'outreach_sent',
  'inserting outbound sent message captures outreach_sent event'
);

-- 2b. Inbound sent → reply event
insert into public.outreach_messages (
  id, organization_id, conversation_id, channel, direction, status, body
) values (
  'e0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'email', 'inbound', 'sent', 'Sounds good!'
);

select is(
  (select event_type::text from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000004'
     and event_type = 'reply'),
  'reply',
  'inserting inbound sent message captures reply event'
);

-- 2c. Draft status change does NOT produce an event
insert into public.outreach_messages (
  id, organization_id, conversation_id, channel, direction, status, body
) values (
  'e0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'email', 'outbound', 'draft', 'Draft message'
);

select is(
  (select count(*)::int from public.knowledge_events
   where (snapshot->>'message_id') = 'e0000000-0000-0000-0000-000000000003'),
  0,
  'draft outreach message does not produce a knowledge_event'
);

-- 2d. Updating already-sent status does NOT produce a duplicate event
update public.outreach_messages
  set body = 'Updated body'
  where id = 'e0000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.knowledge_events
   where entity_id = 'c0000000-0000-0000-0000-000000000004'
     and event_type = 'outreach_sent'),
  1,
  'non-status update on sent message does not duplicate outreach_sent event'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Proposal trigger → knowledge_event
-- ──────────────────────────────────────────────────────────────────────────────

-- Need a lead in a stage that allows proposals
insert into public.leads (
  id, organization_id, title, source, stage, score
) values (
  'c0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'Test Lead Epsilon', 'event', 'meeting_scheduled', 70
);

insert into public.proposals (
  id, organization_id, lead_id, title, status
) values (
  'f0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  'Proposal for Epsilon', 'draft'
);

-- 3a. Proposal status → 'sent' fires proposal_sent event
update public.proposals
  set status = 'sent'
  where id = 'f0000000-0000-0000-0000-000000000001';

select is(
  (select event_type::text from public.knowledge_events
   where (snapshot->>'proposal_id') = 'f0000000-0000-0000-0000-000000000001'),
  'proposal_sent',
  'proposal→sent triggers proposal_sent knowledge_event'
);

-- 3b. Snapshot contains proposal_id
select ok(
  (select (snapshot->>'proposal_id') = 'f0000000-0000-0000-0000-000000000001'
   from public.knowledge_events
   where (snapshot->>'proposal_id') = 'f0000000-0000-0000-0000-000000000001'),
  'proposal_sent snapshot carries proposal_id'
);

-- 3c. Updating proposal status again (same value) does NOT duplicate
update public.proposals set title = 'Renamed' where id = 'f0000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.knowledge_events
   where (snapshot->>'proposal_id') = 'f0000000-0000-0000-0000-000000000001'),
  1,
  'non-status update on sent proposal does not duplicate proposal_sent event'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Insight aggregation — org-level win/loss counts
-- ──────────────────────────────────────────────────────────────────────────────

-- At this point org has: 1 won, 1 lost, 1 on_hold, outreach + reply + proposal events.

select is(
  (select count(*)::int from public.knowledge_events
   where organization_id = 'a0000000-0000-0000-0000-000000000001'
     and event_type = 'won'),
  1,
  'aggregation: org has exactly 1 won event'
);

select is(
  (select count(*)::int from public.knowledge_events
   where organization_id = 'a0000000-0000-0000-0000-000000000001'
     and event_type = 'lost'),
  1,
  'aggregation: org has exactly 1 lost event'
);

select is(
  (select count(*)::int from public.knowledge_events
   where organization_id = 'a0000000-0000-0000-0000-000000000001'
     and event_type in ('won', 'lost')),
  2,
  'aggregation: total closed events = 2'
);

-- Win rate calculation: 1 won / 2 closed = 50%
select is(
  round(
    (select count(*) filter (where event_type = 'won')::numeric /
            nullif(count(*) filter (where event_type in ('won','lost')), 0) * 100
     from public.knowledge_events
     where organization_id = 'a0000000-0000-0000-0000-000000000001')
  ),
  50::numeric,
  'aggregation: win rate = 50% (1 won / 2 closed)'
);

-- 4b. Source-level insight: won event is from 'website', lost from 'linkedin'
select is(
  (select source from public.knowledge_events
   where organization_id = 'a0000000-0000-0000-0000-000000000001'
     and event_type = 'won'),
  'website',
  'aggregation: won event source is website'
);

select is(
  (select source from public.knowledge_events
   where organization_id = 'a0000000-0000-0000-0000-000000000001'
     and event_type = 'lost'),
  'linkedin',
  'aggregation: lost event source is linkedin'
);

-- 4c. Total event count (won + lost + on_hold + outreach_sent + reply + proposal_sent = 6)
select is(
  (select count(*)::int from public.knowledge_events
   where organization_id = 'a0000000-0000-0000-0000-000000000001'),
  6,
  'aggregation: total knowledge events in org = 6'
);

-- 4d. Organization filter isolation: events from this org do not bleed into another
insert into public.organizations (id, name, slug)
values ('a0000000-0000-0000-0000-000000000002', 'OtherOrg', 'otherorg');

select is(
  (select count(*)::int from public.knowledge_events
   where organization_id = 'a0000000-0000-0000-0000-000000000002'),
  0,
  'aggregation: second org has zero knowledge events (isolation)'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. knowledge_events schema constraints
-- ──────────────────────────────────────────────────────────────────────────────

-- 5a. entity_type must be 'lead' or 'opportunity'
select throws_ok(
  $$insert into public.knowledge_events (
      organization_id, entity_type, entity_id, event_type, snapshot
    ) values (
      'a0000000-0000-0000-0000-000000000001',
      'contact',
      gen_random_uuid(),
      'won',
      '{}'::jsonb
    )$$,
  '23514',
  null,
  'entity_type check constraint rejects invalid value'
);

-- 5b. snapshot cannot be null
select throws_ok(
  $$insert into public.knowledge_events (
      organization_id, entity_type, entity_id, event_type, snapshot
    ) values (
      'a0000000-0000-0000-0000-000000000001',
      'lead',
      gen_random_uuid(),
      'won',
      null
    )$$,
  '23502',
  null,
  'snapshot NOT NULL constraint enforced'
);

select * from finish();
rollback;
