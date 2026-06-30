import { Suspense, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Flex, Spin, Button, Typography, Card } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';
import { RouteFallback } from '@/components/route-fallback';

const { Title, Text } = Typography;

export default function AppLayout() {
  const { session, loading, orgs, logout, isPlatformAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate('/login', { replace: true });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <Flex align="center" justify="center" className="radar-canvas" style={{ minHeight: '100vh' }}>
        <Spin size="large" description="Loading workspace…">
          <div style={{ padding: 24 }} />
        </Spin>
      </Flex>
    );
  }

  if (orgs.length === 0) {

    return (
      <Flex align="center" justify="center" className="radar-canvas" style={{ minHeight: '100vh' }}>
        <Card style={{ width: 400, padding: 12, boxShadow: 'var(--ant-box-shadow)' }}>
          <Flex vertical gap={4} style={{ marginBottom: 24 }}>
            <Text className="eyebrow">Welcome to LeadRadar</Text>
            <Title level={4} style={{ margin: 0 }}>
              {isPlatformAdmin ? 'Platform Administrator' : 'No workspace yet'}
            </Title>
            <Text type="secondary">
              {isPlatformAdmin
                ? 'You do not belong to any workspace. Please proceed to the Platform Admin area.'
                : 'You need to be invited to a workspace to get started. Please ask your administrator.'}
            </Text>
          </Flex>

          <Flex gap={12} style={{ marginTop: 24 }}>
            <Button size="large" onClick={() => void logout()} icon={<LogoutOutlined />} block={!isPlatformAdmin}>
              Sign out
            </Button>
            {isPlatformAdmin && (
              <Button type="primary" size="large" onClick={() => navigate('/admin')} block>
                Go to Platform Admin
              </Button>
            )}
          </Flex>
        </Card>
      </Flex>
    );
  }

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}
