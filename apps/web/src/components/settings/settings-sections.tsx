import type { ReactElement } from 'react';
import {
  ApiOutlined,
  AuditOutlined,
  BellOutlined,
  BulbOutlined,
  ChromeOutlined,
  CreditCardOutlined,
  FileTextOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';

export type SettingsSectionKey =
  | 'ai'
  | 'company-brain'
  | 'extension'
  | 'templates'
  | 'integrations'
  | 'billing'
  | 'roles-permissions'
  | 'audit'
  | 'security'
  | 'notifications';

export interface SettingsSection {
  key: SettingsSectionKey;
  label: string;
  href: string;
  icon: ReactElement;
  permissions?: string[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: 'ai',
    label: 'AI & Usage',
    href: '/settings/ai',
    icon: <RobotOutlined />,
    permissions: ['ai.settings.manage', 'usage.read_own', 'usage.read_company_summary', 'usage.read_company', 'company.usage.read'],
  },
  {
    key: 'company-brain',
    label: 'Company Brain',
    href: '/settings/company-brain',
    icon: <BulbOutlined />,
    permissions: ['company_brain.manage'],
  },
  {
    key: 'extension',
    label: 'Extension',
    href: '/settings/extension',
    icon: <ChromeOutlined />,
    permissions: ['extension.use'],
  },
  {
    key: 'templates',
    label: 'Templates',
    href: '/settings/templates',
    icon: <FileTextOutlined />,
    permissions: ['ai.settings.manage'],
  },
  {
    key: 'integrations',
    label: 'Integrations',
    href: '/settings/integrations',
    icon: <ApiOutlined />,
    permissions: ['integrations.manage'],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    href: '/settings/notifications',
    icon: <BellOutlined />,
  },
  {
    key: 'billing',
    label: 'Billing',
    href: '/settings/billing',
    icon: <CreditCardOutlined />,
    permissions: ['billing.manage'],
  },
  {
    key: 'roles-permissions',
    label: 'Members & Roles',
    href: '/settings/roles-permissions',
    icon: <TeamOutlined />,
    permissions: ['members.manage'],
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    href: '/settings/audit',
    icon: <AuditOutlined />,
    permissions: ['audit.read'],
  },
  {
    key: 'security',
    label: 'Security',
    href: '/settings/security',
    icon: <SafetyCertificateOutlined />,
    permissions: ['company.manage'],
  },
];

export function canAccessSettingsSection(
  section: SettingsSection,
  can: (permission: string) => boolean,
): boolean {
  return !section.permissions || section.permissions.some((permission) => can(permission));
}

export function getVisibleSettingsSections(
  can: (permission: string) => boolean,
): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => canAccessSettingsSection(section, can));
}

export function getSettingsSectionByPath(pathname: string): SettingsSection | null {
  return (
    SETTINGS_SECTIONS.find((section) => pathname === section.href || pathname.startsWith(`${section.href}/`)) ??
    null
  );
}

export function getSettingsSectionByKey(key: SettingsSectionKey): SettingsSection | null {
  return SETTINGS_SECTIONS.find((section) => section.key === key) ?? null;
}
