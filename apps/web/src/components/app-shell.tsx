import {
  BarChartOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Layout, Menu, Space, Spin, Tag } from 'antd'
import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../contexts/app-data-context'
import { useAuth } from '../contexts/auth-context'

const menuItems = [
  {
    icon: <BarChartOutlined />,
    key: '/',
    label: 'Dashboard',
  },
  {
    icon: <DatabaseOutlined />,
    key: '/leads',
    label: 'Leads',
  },
  {
    icon: <SettingOutlined />,
    key: '/settings',
    label: 'Settings',
  },
]

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signOut } = useAuth()
  const { displayName, loading, profile } = useAppData()
  const [collapsed, setCollapsed] = useState(false)

  const selectedKey = location.pathname.startsWith('/leads')
    ? '/leads'
    : location.pathname === '/settings'
      ? '/settings'
      : '/'

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <Layout className="app-shell">
      <Layout.Sider
        breakpoint="lg"
        className="app-sider"
        collapsed={collapsed}
        collapsible
        theme="light"
        onCollapse={setCollapsed}
      >
        <div className="app-brand">
          <span className="app-brand-mark">LR</span>
          {!collapsed ? (
            <div className="app-brand-copy">
              <strong>LeadRadar</strong>
              <span>by Hkrafted</span>
            </div>
          ) : null}
        </div>
        <Menu
          items={menuItems}
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => navigate(key)}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="app-header">
          <div className="app-header-meta">
            <Button
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              type="text"
              onClick={() => setCollapsed((current) => !current)}
            />
            <div className="app-header-copy">
              <span className='text-xl font-bold'>Lead operations</span>
            </div>
          </div>
          <Space size="middle">
            <Tag color="processing">{profile?.role ?? 'sales'}</Tag>
            <Space size="small">
              <Avatar icon={<UserOutlined />} />
              <span>{displayName}</span>
            </Space>
            <Button icon={<LogoutOutlined />} onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </Space>
        </Layout.Header>
        <Layout.Content className="app-content">
          {loading ? (
            <div className="login-screen">
              <Spin size="large" />
            </div>
          ) : (
            <Outlet />
          )}
        </Layout.Content>
      </Layout>
    </Layout>
  )
}
