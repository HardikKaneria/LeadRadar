-- Phase 10 · Governance / RBAC tightening (P10-11).
-- Introduces dedicated lead-hunting and external-provider permissions, backfills the default
-- system-role grants, and stops relying on the discovery catalog for lead-hunting read access.

insert into public.permissions (key, description, category)
values
  ('lead_hunting.read', 'View lead-hunting sessions, posts, and evidence', 'lead_hunting'),
  ('lead_hunting.review', 'Research, review, approve, archive, and reject lead-hunting posts', 'lead_hunting'),
  ('lead_hunting.manage', 'Manage lead-hunting settings and limits', 'lead_hunting'),
  ('external_providers.read', 'View external provider configuration and health', 'external_providers'),
  ('external_providers.usage.read', 'View external provider usage and failures', 'external_providers'),
  ('external_providers.manage', 'Manage external provider accounts, keys, and routes', 'external_providers')
on conflict (key) do update
set
  description = excluded.description,
  category = excluded.category;

do $$
declare
  r_master_admin uuid;
  r_company_admin uuid;
  r_sales_exec uuid;
begin
  select id into r_master_admin from public.roles where slug = 'master_admin' and organization_id is null;
  select id into r_company_admin from public.roles where slug = 'company_admin' and organization_id is null;
  select id into r_sales_exec from public.roles where slug = 'sales_executive' and organization_id is null;

  if r_master_admin is not null then
    insert into public.role_permissions (role_id, permission_id)
    select r_master_admin, id from public.permissions
    where key in (
      'lead_hunting.read',
      'lead_hunting.review',
      'lead_hunting.manage',
      'external_providers.read',
      'external_providers.usage.read',
      'external_providers.manage'
    )
    on conflict do nothing;
  end if;

  if r_company_admin is not null then
    insert into public.role_permissions (role_id, permission_id)
    select r_company_admin, id from public.permissions
    where key in (
      'lead_hunting.read',
      'lead_hunting.review',
      'lead_hunting.manage',
      'external_providers.usage.read'
    )
    on conflict do nothing;
  end if;

  if r_sales_exec is not null then
    insert into public.role_permissions (role_id, permission_id)
    select r_sales_exec, id from public.permissions
    where key in (
      'lead_hunting.read',
      'lead_hunting.review',
      'external_providers.usage.read'
    )
    on conflict do nothing;
  end if;
end;
$$;

create or replace function public.can_read_lead_hunting_capture(
  p_org uuid,
  p_captured_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(p_org, 'lead_hunting.read');
$$;

create or replace function public.can_review_lead_hunting_capture(
  p_org uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_permission(p_org, 'lead_hunting.review')
    or public.has_permission(p_org, 'lead_hunting.manage');
$$;

drop policy if exists lead_search_sessions_select_read on public.lead_search_sessions;
create policy lead_search_sessions_select_read on public.lead_search_sessions
  for select using (public.can_read_lead_hunting_capture(organization_id, captured_by_user_id));

drop policy if exists raw_posts_select_read on public.raw_posts;
create policy raw_posts_select_read on public.raw_posts
  for select using (public.can_read_lead_hunting_capture(organization_id, captured_by_user_id));

drop policy if exists post_research_jobs_select_read on public.post_research_jobs;
create policy post_research_jobs_select_read on public.post_research_jobs
  for select using (public.can_read_lead_hunting_raw_post(raw_post_id));

drop policy if exists post_research_reports_select_read on public.post_research_reports;
create policy post_research_reports_select_read on public.post_research_reports
  for select using (public.can_read_lead_hunting_raw_post(raw_post_id));

drop policy if exists post_classifications_select_read on public.post_classifications;
create policy post_classifications_select_read on public.post_classifications
  for select using (public.can_read_lead_hunting_raw_post(raw_post_id));

drop policy if exists archived_posts_select_read on public.archived_posts;
create policy archived_posts_select_read on public.archived_posts
  for select using (public.can_read_lead_hunting_raw_post(raw_post_id));

drop policy if exists field_evidence_logs_select_read on public.field_evidence_logs;
create policy field_evidence_logs_select_read on public.field_evidence_logs
  for select using (raw_post_id is not null and public.can_read_lead_hunting_raw_post(raw_post_id));

drop policy if exists external_provider_calls_usage_read on public.external_provider_calls;
create policy external_provider_calls_usage_read on public.external_provider_calls
  for select using (public.has_permission(organization_id, 'external_providers.usage.read'));

drop policy if exists external_usage_events_usage_read on public.external_usage_events;
create policy external_usage_events_usage_read on public.external_usage_events
  for select using (public.has_permission(organization_id, 'external_providers.usage.read'));
