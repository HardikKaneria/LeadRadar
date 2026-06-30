
import { useEffect, useState } from 'react';
import {
  BarChartOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  GlobalOutlined,
  ReloadOutlined,
  RocketOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Result,
  Row,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
  theme,
  Modal,
  Form,
  Input,
  Select,
  message,
} from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { generatePassword } from '@/lib/password';
import type { UsageCompanySummaryReport } from '@radar/contracts';
import { PageHeader } from '@/components/page-header';

const { Text } = Typography;

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function SimpleMetricCard({
  title,
  value,
  icon,
  hint,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  hint?: string;
}) {
  const { token } = theme.useToken();
  return (
    <Card styles={{ body: { padding: 18 } }} style={{ height: '100%' }}>
      <Flex vertical gap={10}>
        <Flex align="center" gap={10}>
          <span style={{ color: token.colorPrimary, fontSize: 18 }}>{icon}</span>
          <Text strong type="secondary">{title}</Text>
        </Flex>
        <Statistic valueRender={() => <>{value}</>} />
        {hint && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {hint}
          </Text>
        )}
      </Flex>
    </Card>
  );
}

function StubListCard({
  title,
  icon,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  emptyText: string;
}) {
  const { token } = theme.useToken();
  return (
    <Card styles={{ body: { padding: 18 } }} style={{ height: '100%' }}>
      <Flex vertical gap={14} style={{ height: '100%' }}>
        <Flex align="center" gap={10}>
          <span style={{ color: token.colorPrimary, fontSize: 18 }}>{icon}</span>
          <Text strong>{title}</Text>
        </Flex>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
        </div>
        <Tag variant="filled" color="default" style={{ alignSelf: 'flex-start' }}>
          Coming Soon
        </Tag>
      </Flex>
    </Card>
  );
}

export function CompanyAdminDashboard() {
  const { currentOrg, accessToken, can } = useAuth();
  const navigate = useNavigate();

  const organizationId = currentOrg?.organizationId ?? null;
  const canReadUsage = can('ai.usage.read') || currentOrg?.roleSlug === 'company_admin' || currentOrg?.roleSlug === 'master_admin';

  const [usage, setUsage] = useState<UsageCompanySummaryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [form] = Form.useForm();

  const handleInvite = async (values: { email: string; roleSlug: string; password?: string }) => {
    if (!accessToken || !organizationId) return;
    setInviting(true);
    try {
      await api.inviteUser({ accessToken, organizationId }, values.email, values.roleSlug, values.password);
      message.success(`Invited ${values.email}`);
      setInviteModalVisible(false);
      form.resetFields();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invite';
      message.error(msg);
    } finally {
      setInviting(false);
    }
  };

  useEffect(() => {
    if (!accessToken || !organizationId || !canReadUsage) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api.usageCompanySummary({ accessToken, organizationId })
      .then(res => {
        if (!cancelled) setUsage(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to fetch usage';
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [accessToken, organizationId, canReadUsage, reloadToken]);

  if (!currentOrg) {
    return (
      <Result
        status="info"
        title="No workspace yet"
        subTitle="Join or create a workspace to see your company dashboard."
      />
    );
  }

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Company Admin"
        title={`${currentOrg.organizationName} Overview`}
        subtitle="Track team performance, AI usage, and conversion metrics across your workspace."
        extra={
          <Space>
            <Button
              icon={<UserAddOutlined />}
              onClick={() => setInviteModalVisible(true)}
            >
              Invite User
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setReloadToken((value) => value + 1)}
              loading={loading}
            >
              Refresh
            </Button>
            <Button onClick={() => navigate('/settings/ai')}>
              Manage Settings
            </Button>
          </Space>
        }
      />

      <Modal
        title="Invite User"
        open={inviteModalVisible}
        onCancel={() => setInviteModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleInvite}>
          <Form.Item
            name="email"
            label="Email Address"
            rules={[{ required: true, message: 'Please enter an email' }, { type: 'email', message: 'Invalid email' }]}
          >
            <Input placeholder="colleague@example.com" size="large" />
          </Form.Item>
          <Form.Item
            name="roleSlug"
            label="Role"
            rules={[{ required: true, message: 'Please select a role' }]}
            initialValue="sales_executive"
          >
            <Select size="large">
              <Select.Option value="sales_executive">Sales Executive</Select.Option>
              <Select.Option value="company_admin">Company Admin</Select.Option>
            </Select>
          </Form.Item>
          
          <Form.Item name="password" label="Temporary Password (Optional)" tooltip="If provided, the user will be created immediately without waiting for an email invite.">
            <Input.Password size="large" placeholder="Auto-generate or type..." />
          </Form.Item>
          
          <Flex justify="space-between" align="center" style={{ marginTop: 24 }}>
            <Button type="dashed" onClick={() => form.setFieldsValue({ password: generatePassword() })}>
              Generate Strong Password
            </Button>
            <Button type="primary" htmlType="submit" loading={inviting}>
              Send Invite
            </Button>
          </Flex>
        </Form>
      </Modal>

      {error ? (
        <Alert type="error" showIcon title={error} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <SimpleMetricCard
                title="AI Spend (30d)"
                value={
                  <span style={{ fontSize: 32, fontWeight: 600 }}>
                    {loading ? <Skeleton.Button active size="small" /> : usage ? formatCurrency(usage.totals.cost) : formatCurrency(0)}
                  </span>
                }
                icon={<DollarOutlined />}
                hint="Total cost incurred across the workspace."
              />
            </Col>
            <Col xs={24} md={8}>
              <SimpleMetricCard
                title="AI Requests (30d)"
                value={
                  <span style={{ fontSize: 32, fontWeight: 600 }}>
                    {loading ? <Skeleton.Button active size="small" /> : usage ? usage.totals.requests : 0}
                  </span>
                }
                icon={<BarChartOutlined />}
                hint="Total tasks completed by AI agents."
              />
            </Col>
            <Col xs={24} md={8}>
              <SimpleMetricCard
                title="Conversion Rate"
                value={<span style={{ fontSize: 32, fontWeight: 600 }}>0%</span>}
                icon={<RocketOutlined />}
                hint="Discoveries converted to opportunities. (Stub)"
              />
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ alignItems: 'stretch' }}>
            <Col xs={24} md={12}>
              <StubListCard
                title="Conversion by Executive"
                icon={<TeamOutlined />}
                emptyText="Sales executive conversion tracking will arrive in a future update."
              />
            </Col>
            <Col xs={24} md={12}>
              <StubListCard
                title="Best Sources & Services"
                icon={<GlobalOutlined />}
                emptyText="Lead source analytics and service match tracking."
              />
            </Col>
            <Col xs={24} md={12}>
              <StubListCard
                title="Follow-up Performance"
                icon={<ClockCircleOutlined />}
                emptyText="Response time and follow-up tracking will arrive in Phase 5."
              />
            </Col>
            <Col xs={24} md={12}>
              <StubListCard
                title="Top Opportunities"
                icon={<TrophyOutlined />}
                emptyText="Leaderboard of high-value opportunities in the pipeline."
              />
            </Col>
          </Row>
        </>
      )}
    </Flex>
  );
}
