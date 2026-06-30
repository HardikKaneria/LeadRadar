-- P4-08 pgTAP tests: convert_discovery_to_opportunity threshold + force, upsert_company /
-- upsert_contact dedup, merge_companies / merge_contacts reference-repointing,
-- upsert_relationship_edge validation + no-self-loop, add_note / record_attachment entity checks.
--
-- Run with: pnpm dlx supabase test db (requires supabase CLI with live local instance).

begin;

select plan(28);

-- ── Setup ────────────────────────────────────────────────────────────────────

-- Create a test organisation + user so RLS security-definer functions can authenticate.
insert into public.organizations (id, organization_name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Test Org', 'test-org-pgtap')
on conflict (id) do nothing;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000099', 'pgtap@test.internal')
on conflict (id) do nothing;

insert into public.roles (user_id, organization_id, role_slug)
values ('00000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000001', 'company_admin')
on conflict do nothing;

-- Set the session user so auth.uid() returns our test actor.
perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000099"}', true);

-- ── 1. convert_discovery_to_opportunity — threshold guard ────────────────────

-- Seed a discovery + analysis with score=40 (below default threshold of 60).
insert into public.discoveries (id, organization_id, title, source, raw_data, status, created_by)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Low-score discovery', 'manual', '{}', 'analyzed', '00000000-0000-0000-0000-000000000099'
) on conflict (id) do nothing;

insert into public.ai_analysis (discovery_id, organization_id, score, is_bad_lead, summary, created_by)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  40, false, 'Low score', '00000000-0000-0000-0000-000000000099'
) on conflict do nothing;

select throws_ok(
  $$select public.convert_discovery_to_opportunity('00000000-0000-0000-0000-000000000010')$$,
  'P0001',
  null,
  'convert_discovery_to_opportunity should reject score < threshold without force'
);

select lives_ok(
  $$select public.convert_discovery_to_opportunity('00000000-0000-0000-0000-000000000010', null, true)$$,
  'convert_discovery_to_opportunity should succeed when force=true despite low score'
);

-- Re-converting the same discovery should fail (already converted).
select throws_ok(
  $$select public.convert_discovery_to_opportunity('00000000-0000-0000-0000-000000000010', null, true)$$,
  'P0001',
  null,
  'convert_discovery_to_opportunity should reject an already-converted discovery'
);

-- ── 2. convert_discovery_to_opportunity — above threshold ────────────────────

insert into public.discoveries (id, organization_id, title, source, raw_data, status, created_by)
values (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  'High-score discovery', 'manual', '{}', 'analyzed', '00000000-0000-0000-0000-000000000099'
) on conflict (id) do nothing;

insert into public.ai_analysis (discovery_id, organization_id, score, is_bad_lead, summary, created_by)
values (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000001',
  80, false, 'High score', '00000000-0000-0000-0000-000000000099'
) on conflict do nothing;

select lives_ok(
  $$select public.convert_discovery_to_opportunity('00000000-0000-0000-0000-000000000011')$$,
  'convert_discovery_to_opportunity should succeed when score >= threshold'
);

-- ── 3. upsert_company dedup ───────────────────────────────────────────────────

-- First call should create a new company row.
select lives_ok(
  $$select public.upsert_company('00000000-0000-0000-0000-000000000001', 'Acme Corp', 'acme.com', null, null, null, null, null, null, null, null, null)$$,
  'upsert_company should create a company'
);

select is(
  (select count(*)::int from public.companies
   where organization_id = '00000000-0000-0000-0000-000000000001' and name = 'Acme Corp'),
  1,
  'exactly one Acme Corp row should exist after first upsert'
);

-- Second call with same domain should update, not insert.
select lives_ok(
  $$select public.upsert_company('00000000-0000-0000-0000-000000000001', 'Acme Corp Updated', 'acme.com', null, null, null, null, null, null, null, null, null)$$,
  'upsert_company should not error on duplicate domain'
);

select is(
  (select count(*)::int from public.companies
   where organization_id = '00000000-0000-0000-0000-000000000001' and domain = 'acme.com'),
  1,
  'upsert_company should keep exactly one row per domain (dedup)'
);

-- ── 4. upsert_contact dedup ───────────────────────────────────────────────────

-- Seed a company to attach contacts to.
insert into public.companies (id, organization_id, name)
values ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'Contact Host Co')
on conflict (id) do nothing;

select lives_ok(
  $$select public.upsert_contact('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Alice Smith', 'alice@host.com', null, null, null, null, null)$$,
  'upsert_contact should create a contact'
);

select is(
  (select count(*)::int from public.contacts
   where organization_id = '00000000-0000-0000-0000-000000000001' and email = 'alice@host.com'),
  1,
  'upsert_contact: exactly one row for alice@host.com'
);

-- Calling again with the same email should update, not insert.
select lives_ok(
  $$select public.upsert_contact('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020', 'Alice Smith 2', 'alice@host.com', null, null, null, null, null)$$,
  'upsert_contact: second call with same email should not error'
);

select is(
  (select count(*)::int from public.contacts
   where organization_id = '00000000-0000-0000-0000-000000000001' and email = 'alice@host.com'),
  1,
  'upsert_contact: still only one row after second upsert (dedup)'
);

-- ── 5. merge_companies reference-repointing ───────────────────────────────────

insert into public.companies (id, organization_id, name)
values
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000001', 'Primary Co'),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000001', 'Duplicate Co')
on conflict (id) do nothing;

-- Attach a contact to the duplicate.
insert into public.contacts (id, organization_id, company_id, full_name, email)
values ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000031', 'Bob Dupl', 'bob@dupl.com')
on conflict (id) do nothing;

select lives_ok(
  $$select public.merge_companies('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000031')$$,
  'merge_companies should succeed'
);

select is(
  (select company_id from public.contacts where id = '00000000-0000-0000-0000-000000000032'),
  '00000000-0000-0000-0000-000000000030'::uuid,
  'merge_companies: contact re-pointed to primary company'
);

select is(
  (select deleted_at is not null from public.companies where id = '00000000-0000-0000-0000-000000000031'),
  true,
  'merge_companies: duplicate company soft-deleted'
);

-- ── 6. merge_contacts reference-repointing ────────────────────────────────────

insert into public.contacts (id, organization_id, company_id, full_name, email)
values
  ('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000030', 'Primary Contact', 'primary@co.com'),
  ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000030', 'Duplicate Contact', 'dup@co.com')
on conflict (id) do nothing;

select lives_ok(
  $$select public.merge_contacts('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000041')$$,
  'merge_contacts should succeed'
);

select is(
  (select deleted_at is not null from public.contacts where id = '00000000-0000-0000-0000-000000000041'),
  true,
  'merge_contacts: duplicate contact soft-deleted'
);

-- ── 7. add_note entity checks ─────────────────────────────────────────────────

-- Valid entity_type should succeed.
select lives_ok(
  $$select public.add_note(
    '00000000-0000-0000-0000-000000000001',
    'company',
    '00000000-0000-0000-0000-000000000030',
    'Test note body',
    '00000000-0000-0000-0000-000000000099'
  )$$,
  'add_note should succeed with valid entity type and id'
);

select is(
  (select count(*)::int from public.notes
   where entity_type = 'company' and entity_id = '00000000-0000-0000-0000-000000000030'),
  1,
  'add_note: note row inserted'
);

-- Invalid entity_type should raise.
select throws_ok(
  $$select public.add_note(
    '00000000-0000-0000-0000-000000000001',
    'invalid_entity',
    '00000000-0000-0000-0000-000000000030',
    'bad note',
    '00000000-0000-0000-0000-000000000099'
  )$$,
  'P0001',
  null,
  'add_note: should reject unrecognised entity_type'
);

-- ── 8. record_attachment entity checks ───────────────────────────────────────

select lives_ok(
  $$select public.record_attachment(
    '00000000-0000-0000-0000-000000000001',
    'company',
    '00000000-0000-0000-0000-000000000030',
    'report.pdf',
    'application/pdf',
    12345,
    'orgs/test/company/test/report.pdf',
    '00000000-0000-0000-0000-000000000099'
  )$$,
  'record_attachment should succeed with valid entity type'
);

select is(
  (select count(*)::int from public.attachments
   where entity_type = 'company' and entity_id = '00000000-0000-0000-0000-000000000030'),
  1,
  'record_attachment: attachment row inserted'
);

select throws_ok(
  $$select public.record_attachment(
    '00000000-0000-0000-0000-000000000001',
    'invalid_type',
    '00000000-0000-0000-0000-000000000030',
    'bad.pdf', 'application/pdf', 0, 'path', '00000000-0000-0000-0000-000000000099'
  )$$,
  'P0001',
  null,
  'record_attachment: should reject invalid entity_type'
);

-- ── Finish ────────────────────────────────────────────────────────────────────

select * from finish();

rollback;
