create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id)
);
alter table public.platform_admins enable row level security;
create policy "Platform admins are visible to themselves" on public.platform_admins for select using (user_id = auth.uid());

-- Insert new permissions
insert into public.permissions (key, description, category) values
  ('platform.manage', 'Manage platform-wide settings and AI defaults', 'platform'),
  ('company.manage', 'Manage company-wide settings and integrations', 'settings'),
  ('lead_hunting.read', 'View lead-hunting sessions, posts, and evidence', 'lead_hunting'),
  ('lead_hunting.review', 'Research, review, approve, archive, and reject lead-hunting posts', 'lead_hunting'),
  ('lead_hunting.manage', 'Manage lead-hunting settings and limits', 'lead_hunting'),
  ('external_providers.read', 'View external provider configuration and health', 'external_providers'),
  ('external_providers.usage.read', 'View external provider usage and failures', 'external_providers'),
  ('external_providers.manage', 'Manage external provider accounts, keys, and routes', 'external_providers'),
  ('discoveries.read_own', 'View owned discoveries', 'discoveries'),
  ('discoveries.write_own', 'Create/edit owned discoveries', 'discoveries'),
  ('opportunities.read_own', 'View owned opportunities', 'opportunities'),
  ('opportunities.write_own', 'Create/edit owned opportunities', 'opportunities'),
  ('leads.read_own', 'View owned leads', 'leads'),
  ('leads.write_own', 'Create/edit owned leads', 'leads'),
  ('tasks.manage_own', 'Manage own follow-up tasks', 'tasks'),
  ('sensitive.manage', 'Manage sensitive API keys and secrets', 'sensitive')
on conflict (key) do update set description = excluded.description, category = excluded.category;

-- Seed new roles
insert into public.roles (organization_id, name, slug, is_system)
values
  (null, 'Master Admin', 'master_admin', true),
  (null, 'Company Admin', 'company_admin', true),
  (null, 'Sales Executive', 'sales_executive', true)
on conflict (organization_id, slug) do nothing;

-- Update memberships mapping
do $$
declare
  r_master_admin uuid;
  r_company_admin uuid;
  r_sales_exec uuid;
  r_owner uuid;
  r_admin uuid;
  r_manager uuid;
  r_member uuid;
  r_viewer uuid;
begin
  select id into r_master_admin from public.roles where slug = 'master_admin' and organization_id is null;
  select id into r_company_admin from public.roles where slug = 'company_admin' and organization_id is null;
  select id into r_sales_exec from public.roles where slug = 'sales_executive' and organization_id is null;

  select id into r_owner from public.roles where slug = 'owner' and organization_id is null;
  select id into r_admin from public.roles where slug = 'admin' and organization_id is null;
  select id into r_manager from public.roles where slug = 'manager' and organization_id is null;
  select id into r_member from public.roles where slug = 'member' and organization_id is null;
  select id into r_viewer from public.roles where slug = 'viewer' and organization_id is null;

  -- Migrate memberships
  if r_owner is not null then
    update public.memberships set role_id = r_master_admin where role_id = r_owner;
  end if;
  if r_admin is not null then
    update public.memberships set role_id = r_master_admin where role_id = r_admin;
  end if;
  if r_manager is not null then
    update public.memberships set role_id = r_company_admin where role_id = r_manager;
  end if;
  if r_member is not null then
    update public.memberships set role_id = r_sales_exec where role_id = r_member;
  end if;
  if r_viewer is not null then
    update public.memberships set role_id = r_sales_exec where role_id = r_viewer;
  end if;

  -- Re-bind role permissions for the new roles
  delete from public.role_permissions where role_id in (r_master_admin, r_company_admin, r_sales_exec);

  -- Master Admin gets everything except maybe some platform specific ones (or all)
  insert into public.role_permissions (role_id, permission_id)
  select r_master_admin, id from public.permissions;

  -- Company Admin
  insert into public.role_permissions (role_id, permission_id)
  select r_company_admin, id from public.permissions
  where key in (
    'discoveries.read', 'discoveries.write', 'discoveries.approve',
    'opportunities.read', 'opportunities.write', 'leads.read', 'leads.write', 'tasks.manage',
    'ai.use', 'usage.read_own', 'usage.read_company', 'usage.read_company_summary',
    'company.usage.read', 'company_brain.manage', 'lead_hunting.read', 'lead_hunting.review',
    'lead_hunting.manage', 'external_providers.usage.read', 'extension.use', 'audit.read'
  );

  -- Sales Executive
  insert into public.role_permissions (role_id, permission_id)
  select r_sales_exec, id from public.permissions
  where key in (
    'discoveries.read_own', 'discoveries.write_own', 'opportunities.read_own',
    'opportunities.write_own', 'leads.read_own', 'leads.write_own', 'tasks.manage_own',
    'ai.use', 'usage.read_own', 'lead_hunting.read', 'lead_hunting.review',
    'external_providers.usage.read', 'extension.use'
  );

  -- Delete old roles to clean up taxonomy
  delete from public.roles where slug in ('owner', 'admin', 'manager', 'member', 'viewer') and organization_id is null;
end;
$$;
