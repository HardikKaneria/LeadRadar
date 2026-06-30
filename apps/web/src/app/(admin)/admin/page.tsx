
import { useState, useEffect, useCallback } from 'react';
import { Typography, Row, Col, Card, Statistic, Form, Input, Button, Flex, Alert, Spin, App } from 'antd';
import { AppstoreOutlined, UserOutlined, RobotOutlined, LineChartOutlined, ApartmentOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { generatePassword } from '@/lib/password';

const { Paragraph } = Typography;

interface DashboardStats {
  companies: number;
  users: number;
  aiKeys: number;
  aiCalls: number;
}

export default function AdminDashboardPage() {
  const { reload, accessToken, currentOrg } = useAuth();
  const { message } = App.useApp();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({ companies: 0, users: 0, aiKeys: 0, aiCalls: 0 });

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);

    // Helper to safely fetch count without throwing
    const safeCount = async (query: PromiseLike<{ count: number | null }>) => {
      try {
        const { count } = await query;
        return count ?? 0;
      } catch {
        return 0;
      }
    };

    const [orgsCount, usersCount, aiKeysCount, aiCallsCount] = await Promise.all([
      safeCount(supabase.from('organizations').select('id', { count: 'exact', head: true })),
      safeCount(supabase.from('memberships').select('user_id', { count: 'exact', head: true })),
      safeCount(supabase.from('ai_api_keys').select('id', { count: 'exact', head: true }).eq('status', 'active')),
      safeCount(supabase.from('ai_requests').select('id', { count: 'exact', head: true }))
    ]);

    setStats({
      companies: orgsCount,
      users: usersCount,
      aiKeys: aiKeysCount,
      aiCalls: aiCallsCount,
    });

    setStatsLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleCreateWorkspace = async (values: { orgName: string; ownerName: string; ownerEmail: string; password?: string }) => {
    if (!accessToken || !currentOrg) return;
    setCreating(true);
    setError(null);
    try {
      await api.adminProvisionCompany(
        { accessToken, organizationId: currentOrg.organizationId },
        values
      );
      message.success(`Created workspace: ${values.orgName}`);
      await reload();
      form.resetFields();
      await fetchStats();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create company');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Platform Master Dashboard"
        subtitle="High-level overview of the Hkrafted LeadRadar operating environment."
      />

      {statsLoading ? (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin size="large" description="Loading stats…">
            <div style={{ padding: 24 }} />
          </Spin>
        </Flex>
      ) : (
        <Row gutter={[24, 24]}>
          <Col xs={24} sm={12} lg={6}>
            <Card variant="borderless">
              <Statistic
                title="Active Companies"
                value={stats.companies}
                prefix={<AppstoreOutlined style={{ color: '#1677ff' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card variant="borderless">
              <Statistic
                title="Total Users"
                value={stats.users}
                prefix={<UserOutlined style={{ color: '#52c41a' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card variant="borderless">
              <Statistic
                title="Active AI Keys"
                value={stats.aiKeys}
                prefix={<RobotOutlined style={{ color: '#722ed1' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card variant="borderless">
              <Statistic
                title="AI Calls (total)"
                value={stats.aiCalls}
                prefix={<LineChartOutlined style={{ color: '#faad14' }} />}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <Card variant="borderless" title="Provision New Company">
            <Paragraph type="secondary" style={{ marginBottom: 24 }}>
              As a Master Admin, you can provision new workspaces on the platform. After creating a workspace, you can enter the app shell to invite a Company Admin.
            </Paragraph>
            
            {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />}

            <Form form={form} layout="vertical" onFinish={handleCreateWorkspace}>
              <Form.Item name="orgName" label="Workspace Name" rules={[{ required: true, message: 'Please enter a name' }]}>
                <Input size="large" prefix={<ApartmentOutlined />} placeholder="Acme Corp" />
              </Form.Item>
              <Form.Item name="ownerName" label="Owner Name" rules={[{ required: true, message: 'Please enter owner name' }]}>
                <Input size="large" prefix={<UserOutlined />} placeholder="John Doe" />
              </Form.Item>
              <Form.Item name="ownerEmail" label="Owner Email" rules={[{ required: true, type: 'email', message: 'Please enter a valid email' }]}>
                <Input size="large" placeholder="john@acme.com" />
              </Form.Item>
              <Form.Item name="password" label="Temporary Password (Optional)" tooltip="If provided, the user will be created immediately without waiting for an email invite.">
                <Input.Password size="large" placeholder="Auto-generate or type..." />
              </Form.Item>
              <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
                <Button type="dashed" onClick={() => form.setFieldsValue({ password: generatePassword() })}>
                  Generate Strong Password
                </Button>
                <Button type="primary" htmlType="submit" size="large" loading={creating}>
                  Provision Company
                </Button>
              </Flex>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card variant="borderless" title="Recent Platform Activity">
            <Paragraph type="secondary">
              Platform-wide audit logs and alerts will appear here. (Stub)
            </Paragraph>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
