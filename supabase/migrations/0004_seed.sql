-- Seed the permission catalog and system roles. Idempotent.
-- Mirrors packages/contracts/src/permissions.ts — keep both in sync.

insert into public.permissions (key, description, category) values
  ('discoveries.read',     'View discoveries',                         'discoveries'),
  ('discoveries.write',    'Create/edit discoveries',                  'discoveries'),
  ('discoveries.approve',  'Approve discoveries into opportunities',   'discoveries'),
  ('opportunities.read',   'View opportunities',                       'opportunities'),
  ('opportunities.write',  'Create/edit opportunities',                'opportunities'),
  ('leads.read',           'View leads',                               'leads'),
  ('leads.write',          'Create/edit leads',                        'leads'),
  ('tasks.manage',         'Manage follow-up tasks',                   'tasks'),
  ('ai.use',               'Use AI features (assistant, analysis)',    'ai'),
  ('ai.settings.manage',   'Manage AI providers and prompts',          'ai'),
  ('usage.read_own',       'View your own AI usage',                   'usage'),
  ('usage.read_company',   'View detailed company AI usage',           'usage'),
  ('usage.read_company_summary', 'View company AI usage summaries',    'usage'),
  ('company.usage.read',   'View company AI usage limits and credits', 'usage'),
  ('company_brain.manage', 'Manage the Company Brain',                 'settings'),
  ('lead_hunting.read',    'View lead-hunting sessions, posts, and evidence', 'lead_hunting'),
  ('lead_hunting.review',  'Research, review, approve, archive, and reject lead-hunting posts', 'lead_hunting'),
  ('lead_hunting.manage',  'Manage lead-hunting settings and limits',  'lead_hunting'),
  ('external_providers.read', 'View external provider configuration and health', 'external_providers'),
  ('external_providers.usage.read', 'View external provider usage and failures', 'external_providers'),
  ('external_providers.manage', 'Manage external provider accounts, keys, and routes', 'external_providers'),
  ('members.manage',       'Manage members and roles',                 'settings'),
  ('billing.manage',       'Manage billing and plan',                  'settings'),
  ('audit.read',           'View audit and AI request logs',           'settings'),
  ('integrations.manage',  'Manage integrations',                      'settings'),
  ('extension.use',        'Use the capture extension',                'extension')
on conflict (key) do update set description = excluded.description, category = excluded.category;

-- System roles (organization_id = null).
insert into public.roles (organization_id, name, slug, is_system)
select null, v.name, v.slug, true
from (values
  ('Owner', 'owner'),
  ('Admin', 'admin'),
  ('Manager', 'manager'),
  ('Member', 'member'),
  ('Viewer', 'viewer')
) as v(name, slug)
where not exists (
  select 1 from public.roles r where r.organization_id is null and r.slug = v.slug
);

-- Grant helper: assign a set of permission keys to a system role.
do $$
declare
  owner_admin text[] := array(select key from public.permissions);
  manager text[] := array['discoveries.read','discoveries.write','discoveries.approve',
    'opportunities.read','opportunities.write','leads.read','leads.write','tasks.manage',
    'ai.use','usage.read_own','usage.read_company','usage.read_company_summary',
    'company.usage.read','company_brain.manage','extension.use','audit.read'];
  member text[] := array['discoveries.read','discoveries.write','opportunities.read',
    'opportunities.write','leads.read','leads.write','tasks.manage','ai.use',
    'usage.read_own','usage.read_company_summary','extension.use'];
  viewer text[] := array['discoveries.read','opportunities.read','leads.read'];
  r record;
  grant_keys text[];
begin
  for r in select id, slug from public.roles where organization_id is null loop
    grant_keys := case r.slug
      when 'owner' then owner_admin
      when 'admin' then owner_admin
      when 'manager' then manager
      when 'member' then member
      when 'viewer' then viewer
      else array[]::text[]
    end;

    insert into public.role_permissions (role_id, permission_id)
    select r.id, p.id from public.permissions p where p.key = any(grant_keys)
    on conflict do nothing;
  end loop;
end;
$$;
