
import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ApartmentOutlined,
  CheckSquareOutlined,
  CompassOutlined,
  DatabaseOutlined,
  FundOutlined,
  FunnelPlotOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusSquareOutlined,
  RadarChartOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Dropdown,
  Empty,
  Flex,
  Layout,
  Menu,
  Tag,
  Tooltip,
  Typography,
  theme,
  type MenuProps,
} from 'antd';
import { useAuth } from '@/lib/auth';
import { getSettingsSectionByPath } from '@/components/settings/settings-sections';
import { NotificationBell } from './notifications/notification-bell';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  permissions?: string[];
  ready: boolean;
}

const NAV: NavItem[] = [
  { label: 'Action Center', href: '/', icon: <CompassOutlined />, ready: true },
  { label: 'Capture', href: '/capture', icon: <PlusSquareOutlined />, permissions: ['discoveries.write'], ready: true },
  { label: 'Lead Hunting', href: '/lead-hunting', icon: <SearchOutlined />, permissions: ['lead_hunting.read'], ready: true },
  { label: 'Discovery Inbox', href: '/inbox', icon: <InboxOutlined />, permissions: ['discoveries.read'], ready: true },
  { label: 'Opportunities', href: '/opportunities', icon: <RadarChartOutlined />, permissions: ['opportunities.read'], ready: true },
  { label: 'Demand Radar', href: '/opportunities/radar', icon: <CompassOutlined />, permissions: ['opportunities.read'], ready: true },
  { label: 'Pipeline', href: '/pipeline', icon: <FunnelPlotOutlined />, permissions: ['leads.read', 'leads.read_own'], ready: true },
  { label: 'Tasks', href: '/tasks', icon: <CheckSquareOutlined />, permissions: ['tasks.manage', 'tasks.manage_own'], ready: true },
  { label: 'Companies', href: '/companies', icon: <ApartmentOutlined />, permissions: ['opportunities.read'], ready: true },
  { label: 'Knowledge', href: '/knowledge', icon: <DatabaseOutlined />, permissions: ['knowledge.read'], ready: true },
  { label: 'Revenue Forecast', href: '/forecast', icon: <FundOutlined />, permissions: ['knowledge.read'], ready: true },
  { label: 'AI Assistant', href: '/assistant', icon: <RobotOutlined />, ready: false },
  { label: 'Jobs', href: '/jobs', icon: <ThunderboltOutlined />, ready: true },
  { label: 'Settings', href: '/settings', icon: <SettingOutlined />, ready: true },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(value: string): string {
  const clean = value.trim();
  if (!clean) return '?';
  return clean.slice(0, 2).toUpperCase();
}

function prettifySegment(segment: string): string {
  return segment
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { email, currentOrg, logout, can, isPlatformAdmin } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const { token } = theme.useToken();
  const [collapsed, setCollapsed] = useState(false);

  const visible = useMemo(
    () => NAV.filter((item) => !item.permissions || item.permissions.some((permission) => can(permission))),
    [can],
  );

  const activeHref = useMemo(() => {
    const match = visible
      .filter((item) => item.ready && isActivePath(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0];
    return match?.href ?? '/';
  }, [visible, pathname]);

  const activeLabel = visible.find((item) => item.href === activeHref)?.label ?? 'Radar OIP';

  const breadcrumbs = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const crumbs = [{ title: 'Workspace', href: '/' }];
    let built = '';
    for (const segment of segments) {
      built += `/${segment}`;
      const navMatch = NAV.find((item) => item.href === built);
      const settingsMatch = getSettingsSectionByPath(built);
      crumbs.push({
        title: navMatch?.label ?? settingsMatch?.label ?? prettifySegment(segment),
        href: built,
      });
    }
    return crumbs;
  }, [pathname]);

  const menuItems: MenuProps['items'] = visible.map((item) => ({
    key: item.href,
    icon: item.icon,
    disabled: !item.ready,
    label: item.ready ? (
      item.label
    ) : (
      <Flex align="center" justify="space-between" gap={8}>
        <span>{item.label}</span>
        <Tag style={{ marginInlineEnd: 0 }} variant="filled" color="default">
          Soon
        </Tag>
      </Flex>
    ),
    title: item.ready ? item.label : `${item.label} · coming soon`,
  }));

  const userMenu: MenuProps['items'] = [
    {
      key: 'email',
      disabled: true,
      label: (
        <div style={{ paddingBlock: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Signed in as
          </Text>
          <div>
            <Text strong>{email}</Text>
          </div>
        </div>
      ),
    },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, danger: true, label: 'Sign out' },
  ];

  return (
    <Layout hasSider style={{ minHeight: '100vh' }}>
      <Sider
        width={264}
        collapsedWidth={80}
        collapsible
        collapsed={collapsed}
        trigger={null}
        style={{
          position: 'fixed',
          insetInlineStart: 0,
          top: 0,
          bottom: 0,
          height: '100vh',
          borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <div
          style={{
            minHeight: 72,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: collapsed ? '16px 0' : '16px 20px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <RadarChartOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
          {!collapsed && (
            <div>
              <Text className="font-display" strong style={{ fontSize: 18, letterSpacing: '-0.01em', display: 'block' }}>
                Radar <Text type="secondary" style={{ fontWeight: 400 }}>OIP</Text>
              </Text>
            </div>
          )}
        </div>

        {!collapsed && (
          <div style={{ padding: '16px 16px 8px' }}>
            <div
              className="surface-border"
              style={{
                borderRadius: token.borderRadiusLG,
                padding: 12,
                background: 'linear-gradient(180deg, rgba(61, 220, 151, 0.08), rgba(61, 220, 151, 0.02))',
              }}
            >
              <Text className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>
                Workspace
              </Text>
              <Flex align="center" gap={12}>
                <Avatar
                  shape="square"
                  size={40}
                  style={{ background: 'var(--brand-soft)', color: token.colorPrimary, fontWeight: 700 }}
                >
                  {initialsOf(currentOrg?.organizationName ?? 'W')}
                </Avatar>
                <div style={{ minWidth: 0 }}>
                  <Text strong ellipsis style={{ display: 'block', maxWidth: 156 }}>
                    {currentOrg?.organizationName ?? 'No workspace'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12, textTransform: 'capitalize' }}>
                    {currentOrg?.roleSlug ?? '—'}
                  </Text>
                </div>
              </Flex>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBlock: 12 }}>
          {!collapsed && (
            <Text className="eyebrow" style={{ display: 'block', paddingInline: 20, marginBottom: 8 }}>
              Navigation
            </Text>
          )}
          <Menu
            mode="inline"
            theme="dark"
            selectedKeys={[activeHref]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{ borderInlineEnd: 0, background: 'transparent' }}
          />
        </div>

        <div style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, padding: collapsed ? 12 : 16, flexShrink: 0 }}>
          <Flex align="center" gap={12} justify={collapsed ? 'center' : 'flex-start'}>
            <Avatar
              shape="square"
              style={{ background: 'var(--brand-soft)', color: token.colorPrimary, fontWeight: 700 }}
            >
              {initialsOf(email ?? '?')}
            </Avatar>
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <Text strong ellipsis style={{ display: 'block', maxWidth: 150 }}>
                  {email ?? 'Signed out'}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Account controls
                </Text>
              </div>
            )}
          </Flex>
        </div>
        </div>
      </Sider>

      <Layout style={{ marginInlineStart: collapsed ? 72 : 264, transition: 'margin 0.2s' }}>
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            backdropFilter: 'blur(8px)',
            background: 'rgba(17, 23, 21, 0.82)',
          }}
        >
          <Button
            type="text"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((v) => !v)}
          />
          <div style={{ minWidth: 0 }}>
            <Breadcrumb
              items={breadcrumbs.map((crumb, index) => ({
                title:
                  index === breadcrumbs.length - 1 ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {crumb.title}
                    </Text>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate(crumb.href)}
                      style={{
                        background: 'none',
                        border: 0,
                        color: token.colorTextTertiary,
                        padding: 0,
                        cursor: 'pointer',
                        font: 'inherit',
                      }}
                    >
                      {crumb.title}
                    </button>
                  ),
              }))}
            />
            <Text strong style={{ fontSize: 16, display: 'block', marginTop: 2 }}>
              {activeLabel}
            </Text>
          </div>

          <Flex align="center" gap={8} style={{ marginInlineStart: 'auto' }}>
            {isPlatformAdmin && (
              <Button onClick={() => navigate('/admin')}>
                Platform Admin
              </Button>
            )}
            <Tooltip title="Command palette coming soon">
              <Button icon={<SearchOutlined />} style={{ minWidth: 136, justifyContent: 'space-between' }}>
                <span>Command</span>
                <span className="kbd">⌘K</span>
              </Button>
            </Tooltip>

            {can('discoveries.write') && (
              <Button type="primary" icon={<PlusSquareOutlined />} onClick={() => navigate('/capture')}>
                Capture
              </Button>
            )}

            <NotificationBell />

            <Dropdown
              menu={{
                items: userMenu,
                onClick: ({ key }) => {
                  if (key === 'logout') void logout();
                },
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button type="text" style={{ height: 40, paddingInline: 6 }}>
                <Avatar size={28} style={{ background: token.colorPrimary, fontWeight: 600 }}>
                  {initialsOf(email ?? '?')}
                </Avatar>
              </Button>
            </Dropdown>
          </Flex>
        </Header>

        <Content className="radar-canvas" style={{ padding: 24 }}>
          <div style={{ maxWidth: 1480, marginInline: 'auto' }}>{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}
