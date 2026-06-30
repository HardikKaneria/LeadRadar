/**
 * RBAC permission catalog + default system roles.
 * Mirrors the keys seeded in supabase/migrations (0004_seed.sql + 0025_v3_roles_platform_admins.sql)
 * and enforced by the PermissionGuard. Keep this list in sync with those migrations.
 */

export const PERMISSIONS = [
  { key: 'discoveries.read', category: 'discoveries', description: 'View discoveries' },
  { key: 'discoveries.read_own', category: 'discoveries', description: 'View owned discoveries' },
  { key: 'discoveries.write', category: 'discoveries', description: 'Create/edit discoveries' },
  { key: 'discoveries.write_own', category: 'discoveries', description: 'Create/edit owned discoveries' },
  { key: 'discoveries.approve', category: 'discoveries', description: 'Approve discoveries into opportunities' },
  { key: 'opportunities.read', category: 'opportunities', description: 'View opportunities' },
  { key: 'opportunities.read_own', category: 'opportunities', description: 'View owned opportunities' },
  { key: 'opportunities.write', category: 'opportunities', description: 'Create/edit opportunities' },
  { key: 'opportunities.write_own', category: 'opportunities', description: 'Create/edit owned opportunities' },
  { key: 'leads.read', category: 'leads', description: 'View leads' },
  { key: 'leads.read_own', category: 'leads', description: 'View owned leads' },
  { key: 'leads.write', category: 'leads', description: 'Create/edit leads' },
  { key: 'leads.write_own', category: 'leads', description: 'Create/edit owned leads' },
  { key: 'tasks.manage', category: 'tasks', description: 'Manage follow-up tasks' },
  { key: 'tasks.manage_own', category: 'tasks', description: 'Manage own follow-up tasks' },
  { key: 'ai.use', category: 'ai', description: 'Use AI features (assistant, analysis)' },
  { key: 'ai.settings.manage', category: 'ai', description: 'Manage AI providers and prompts' },
  { key: 'knowledge.read', category: 'knowledge', description: 'View knowledge and insights' },
  { key: 'usage.read_own', category: 'usage', description: 'View your own AI usage' },
  { key: 'usage.read_company', category: 'usage', description: 'View detailed company AI usage' },
  { key: 'usage.read_company_summary', category: 'usage', description: 'View company AI usage summaries' },
  { key: 'company.usage.read', category: 'usage', description: 'View company AI usage limits and credits' },
  { key: 'company.manage', category: 'settings', description: 'Manage company-wide settings and integrations' },
  { key: 'company_brain.manage', category: 'settings', description: 'Manage the Company Brain' },
  { key: 'lead_hunting.read', category: 'lead_hunting', description: 'View lead-hunting sessions, posts, and evidence' },
  { key: 'lead_hunting.review', category: 'lead_hunting', description: 'Research, review, approve, archive, and reject lead-hunting posts' },
  { key: 'lead_hunting.manage', category: 'lead_hunting', description: 'Manage lead-hunting settings and limits' },
  { key: 'external_providers.read', category: 'external_providers', description: 'View external provider configuration and health' },
  { key: 'external_providers.usage.read', category: 'external_providers', description: 'View external provider usage and failures' },
  { key: 'external_providers.manage', category: 'external_providers', description: 'Manage external provider accounts, keys, and routes' },
  { key: 'members.manage', category: 'settings', description: 'Manage members and roles' },
  { key: 'billing.manage', category: 'settings', description: 'Manage billing and plan' },
  { key: 'audit.read', category: 'settings', description: 'View audit and AI request logs' },
  { key: 'integrations.manage', category: 'settings', description: 'Manage integrations' },
  { key: 'platform.manage', category: 'platform', description: 'Manage platform-wide settings and AI defaults' },
  { key: 'sensitive.manage', category: 'sensitive', description: 'Manage sensitive API keys and secrets' },
  { key: 'extension.use', category: 'extension', description: 'Use the capture extension' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

/**
 * System role taxonomy (v3). Mirrors supabase/migrations/0025_v3_roles_platform_admins.sql.
 * `master_admin` is the platform-owner role: it is created only when a platform admin provisions
 * an organization (see the `create_organization` RPC) and is never assigned through the member
 * invite/update flow. Org admins may grant only the `ASSIGNABLE_ROLES` below.
 */
export const SYSTEM_ROLES = ['master_admin', 'company_admin', 'sales_executive'] as const;
export type SystemRoleSlug = (typeof SYSTEM_ROLES)[number];

/** Roles a company_admin can hand out via invite/update. Excludes `master_admin` by design. */
export const ASSIGNABLE_ROLES = ['company_admin', 'sales_executive'] as const;
export type AssignableRoleSlug = (typeof ASSIGNABLE_ROLES)[number];

/** Default permission grants per system role. `master_admin` gets everything. */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleSlug, PermissionKey[] | '*'> = {
  master_admin: '*',
  company_admin: [
    'discoveries.read',
    'discoveries.write',
    'discoveries.approve',
    'opportunities.read',
    'opportunities.write',
    'leads.read',
    'leads.write',
    'tasks.manage',
    'ai.use',
    'knowledge.read',
    'usage.read_own',
    'usage.read_company',
    'usage.read_company_summary',
    'company.usage.read',
    'company_brain.manage',
    'lead_hunting.read',
    'lead_hunting.review',
    'lead_hunting.manage',
    'external_providers.usage.read',
    'extension.use',
    'audit.read',
  ],
  sales_executive: [
    'discoveries.read',
    'discoveries.write',
    'discoveries.approve',
    'opportunities.read',
    'opportunities.write',
    'leads.read',
    'leads.write',
    'tasks.manage',
    'ai.use',
    'knowledge.read',
    'usage.read_own',
    'lead_hunting.read',
    'lead_hunting.review',
    'external_providers.usage.read',
    'extension.use',
  ],
};

export function resolveRolePermissions(role: SystemRoleSlug): PermissionKey[] {
  const grant = SYSTEM_ROLE_PERMISSIONS[role];
  return grant === '*' ? [...PERMISSION_KEYS] : grant;
}
