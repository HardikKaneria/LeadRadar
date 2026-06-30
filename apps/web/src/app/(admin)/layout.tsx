import { Suspense, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Spin, Flex } from 'antd';
import { useAuth } from '@/lib/auth';
import { AdminShell } from '@/components/admin-shell';
import { RouteFallback } from '@/components/route-fallback';

export default function AdminLayout() {
  const { session, loading, isPlatformAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate('/login', { replace: true });
    } else if (!isPlatformAdmin) {
      navigate('/', { replace: true });
    }
  }, [session, loading, isPlatformAdmin, navigate]);

  if (loading || !session || !isPlatformAdmin) {
    return (
      <Flex align="center" justify="center" style={{ height: '100vh' }}>
        <Spin size="large" />
      </Flex>
    );
  }

  return (
    <AdminShell>
      <Suspense fallback={<RouteFallback />}>
        <Outlet />
      </Suspense>
    </AdminShell>
  );
}
