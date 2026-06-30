
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ApiOutlined,
  ApartmentOutlined,
  AuditOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Breadcrumb,
  Button,
  Dropdown,
  Flex,
  Layout,
  Menu,
  Typography,
  theme,
  type MenuProps,
} from 'antd';
import { useAuth } from '@/lib/auth';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  { label: 'Master Dashboard', href: '/admin', icon: <DashboardOutlined /> },
  { label: 'Companies', href: '/admin/companies', icon: <ApartmentOutlined /> },
  { label: 'Users', href: '/admin/users', icon: <UserOutlined /> },
  { label: 'AI Providers', href: '/admin/ai-providers', icon: <RobotOutlined /> },
  { label: 'External Providers', href: '/admin/external-providers', icon: <ApiOutlined /> },
  { label: 'AI Routing', href: '/admin/routing', icon: <ThunderboltOutlined /> },
  { label: 'AI Prompts', href: '/admin/prompts', icon: <SettingOutlined /> },
  { label: 'AI Usage Ledger', href: '/admin/usage', icon: <LineChartOutlined /> },
  { label: 'Billing & Quotas', href: '/admin/billing', icon: <CreditCardOutlined /> },
  { label: 'Audit Log', href: '/admin/audit', icon: <AuditOutlined /> },
  { label: 'System Health', href: '/admin/health', icon: <SettingOutlined /> },
  { label: 'Background Jobs', href: '/admin/jobs', icon: <ThunderboltOutlined /> },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
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

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const { token } = theme.useToken();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems: MenuProps['items'] = NAV.map((item) => ({
    key: item.href,
    icon: item.icon,
    label: item.label,
    onClick: () => navigate(item.href),
  }));

  const activeKey = NAV.find((n) => isActivePath(pathname, n.href))?.href ?? '/admin';
  const breadcrumbItems = pathname
    .split('/')
    .filter(Boolean)
    .map((seg, i, arr) => {
      const url = `/${arr.slice(0, i + 1).join('/')}`;
      return {
        title: <a onClick={() => navigate(url)}>{prettifySegment(seg)}</a>,
      };
    });

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'back',
      label: 'Back to App',
      onClick: () => navigate('/'),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Log out',
      onClick: logout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: token.colorBgContainer }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="light"
        width={260}
        style={{
          borderRight: `1px solid ${token.colorBorderSecondary}`,
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Flex
          align="center"
          justify="space-between"
          style={{
            height: 64,
            padding: collapsed ? '0 16px' : '0 24px',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            transition: 'padding 0.2s',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              overflow: 'hidden',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/admin')}
          >
            <div
              style={{
                width: 32,
                height: 32,
                background: token.colorError,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                flexShrink: 0,
              }}
            >
              H
            </div>
            {!collapsed && (
              <Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
                Master Admin
              </Text>
            )}
          </div>
        </Flex>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          <Menu
            mode="inline"
            selectedKeys={[activeKey]}
            items={menuItems}
            style={{ borderRight: 'none' }}
          />
        </div>
      </Sider>

      <Layout
        style={{
          marginLeft: collapsed ? 80 : 260,
          transition: 'margin-left 0.2s',
          background: token.colorBgLayout,
          minHeight: '100vh',
        }}
      >
        <Header
          style={{
            padding: '0 24px',
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 9,
            height: 64,
            lineHeight: '64px',
          }}
        >
          <Flex align="center" gap={16}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16, width: 40, height: 40 }}
            />
            <Breadcrumb items={breadcrumbItems} />
          </Flex>

          <Flex align="center" gap={16}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Text style={{ color: token.colorTextSecondary }}>{email}</Text>
                <Avatar
                  style={{
                    backgroundColor: token.colorPrimary,
                    color: '#fff',
                    verticalAlign: 'middle',
                  }}
                >
                  {initialsOf(email ?? '')}
                </Avatar>
              </div>
            </Dropdown>
          </Flex>
        </Header>

        <Content style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
