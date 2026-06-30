import { useEffect, useState } from 'react';
import {
  App,
  Avatar,
  Badge,
  Button,
  Card,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import { DeleteOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { PageSection } from '@/components/ui/page-section';

const { Text } = Typography;

const ROLE_OPTIONS = [
  { label: 'Master Admin', value: 'master_admin', color: 'red', description: 'Full platform access' },
  { label: 'Company Admin', value: 'company_admin', color: 'orange', description: 'Manage org settings, team, and AI' },
  { label: 'Sales Executive', value: 'sales_executive', color: 'blue', description: 'Work leads, opportunities, and outreach' },
];

function RoleTag({ slug }: { slug: string }) {
  const opt = ROLE_OPTIONS.find((r) => r.value === slug);
  return <Tag color={opt?.color ?? 'default'}>{opt?.label ?? slug}</Tag>;
}

interface Member {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  role_slug: string;
  email: string;
  display_name: string | null;
}

export default function RolesPermissionsPage() {
  const { currentOrg, accessToken, session, can } = useAuth();
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();

  const organizationId = currentOrg?.organizationId;
  const currentUserId = session?.user?.id;
  const canManage = can('members.manage');

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [form] = Form.useForm<{ email: string; roleSlug: string; password?: string }>();

  const ctx = { accessToken: accessToken ?? '', organizationId: organizationId ?? '' };

  async function fetchMembers() {
    if (!accessToken || !organizationId) return;
    setLoading(true);
    try {
      const data = await api.request('/users/members', ctx);
      setMembers(data as Member[]);
    } catch {
      message.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, organizationId]);

  async function handleInvite(values: { email: string; roleSlug: string; password?: string }) {
    if (!accessToken) return;
    setInviting(true);
    try {
      await api.request('/users/invite', ctx, {
        method: 'POST',
        body: JSON.stringify({ email: values.email, roleSlug: values.roleSlug, password: values.password }),
      });
      message.success(`Invite sent to ${values.email}`);
      setInviteOpen(false);
      form.resetFields();
      void fetchMembers();
    } catch {
      message.error('Failed to send invite — check the email and try again');
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, roleSlug: string) {
    if (!accessToken) return;
    try {
      await api.request(`/users/members/${memberId}/role`, ctx, {
        method: 'PUT',
        body: JSON.stringify({ roleSlug }),
      });
      message.success('Role updated');
      void fetchMembers();
    } catch {
      message.error('Failed to update role');
    }
  }

  async function handleRemove(memberId: string, email: string) {
    if (!accessToken) return;
    modal.confirm({
      title: 'Remove member?',
      content: `${email} will immediately lose access to this workspace.`,
      okText: 'Remove',
      okType: 'danger',
      onOk: async () => {
        try {
          await api.request(`/users/members/${memberId}`, ctx, { method: 'DELETE' });
          message.success('Member removed');
          void fetchMembers();
        } catch {
          message.error('Failed to remove member');
        }
      },
    });
  }

  const columns = [
    {
      title: 'Member',
      key: 'member',
      render: (_: unknown, record: Member) => (
        <Flex align="center" gap={10}>
          <Avatar icon={<UserOutlined />} size={32} style={{ background: token.colorPrimary }} />
          <Flex vertical gap={2}>
            <Text strong style={{ lineHeight: 1.3 }}>
              {record.display_name || record.email}
              {record.user_id === currentUserId && (
                <Tag style={{ marginLeft: 6 }} color="geekblue">You</Tag>
              )}
            </Text>
            {record.display_name && (
              <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>
            )}
          </Flex>
        </Flex>
      ),
    },
    {
      title: 'Role',
      key: 'role',
      render: (_: unknown, record: Member) =>
        canManage && record.user_id !== currentUserId ? (
          <Select
            value={record.role_slug}
            style={{ width: 180 }}
            onChange={(val) => void handleRoleChange(record.id, val)}
            options={ROLE_OPTIONS.map((r) => ({
              label: (
                <Flex vertical gap={0}>
                  <Text strong style={{ fontSize: 13 }}>{r.label}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{r.description}</Text>
                </Flex>
              ),
              value: r.value,
            }))}
          />
        ) : (
          <RoleTag slug={record.role_slug} />
        ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Badge
          status={status === 'active' ? 'success' : 'default'}
          text={<Text style={{ fontSize: 13 }}>{status === 'active' ? 'Active' : 'Inactive'}</Text>}
        />
      ),
    },
    {
      title: 'Joined',
      dataIndex: 'created_at',
      key: 'joined',
      render: (date: string) => (
        <Tooltip title={dayjs(date).format('MMMM D, YYYY h:mm A')}>
          <Text type="secondary" style={{ fontSize: 13 }}>{dayjs(date).format('MMM D, YYYY')}</Text>
        </Tooltip>
      ),
    },
    ...(canManage
      ? [
          {
            title: '',
            key: 'actions',
            width: 48,
            render: (_: unknown, record: Member) =>
              record.user_id !== currentUserId ? (
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => void handleRemove(record.id, record.email)}
                />
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <Flex vertical gap={24} style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px' }}>
      <PageHeader
        eyebrow="Settings"
        title="Team & Roles"
        subtitle="Manage who has access to your workspace and what they can do."
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
              Invite member
            </Button>
          ) : undefined
        }
      />

      <PageSection
        title={`Team members (${members.length})`}
        subtitle="Active and inactive members of your organization."
      >
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
          <Card styles={{ body: { padding: 0 } }}>
            <Table
              dataSource={members}
              columns={columns}
              rowKey="id"
              pagination={false}
              locale={{ emptyText: 'No members yet — invite your first teammate.' }}
            />
          </Card>
        )}
      </PageSection>

      <PageSection
        title="Role permissions"
        subtitle="What each role can do in this workspace."
      >
        <Card styles={{ body: { padding: 0 } }}>
          <Table
            dataSource={[
              { key: 'leads', feature: 'View & work leads', master_admin: true, company_admin: true, sales_executive: true },
              { key: 'opp', feature: 'Manage opportunities', master_admin: true, company_admin: true, sales_executive: true },
              { key: 'brain', feature: 'Company Brain settings', master_admin: true, company_admin: true, sales_executive: false },
              { key: 'ai', feature: 'Use AI features', master_admin: true, company_admin: true, sales_executive: true },
              { key: 'members', feature: 'Invite & manage team', master_admin: true, company_admin: true, sales_executive: false },
              { key: 'platform', feature: 'Platform admin panel', master_admin: true, company_admin: false, sales_executive: false },
              { key: 'audit', feature: 'View audit logs', master_admin: true, company_admin: true, sales_executive: false },
              { key: 'billing', feature: 'Billing & usage', master_admin: true, company_admin: false, sales_executive: false },
            ]}
            columns={[
              { title: 'Feature', dataIndex: 'feature', key: 'feature', render: (v) => <Text strong>{v}</Text> },
              { title: 'Master Admin', dataIndex: 'master_admin', key: 'ma', width: 130, align: 'center' as const, render: (v: boolean) => v ? <Tag color="green">✓ Yes</Tag> : <Tag color="default">—</Tag> },
              { title: 'Company Admin', dataIndex: 'company_admin', key: 'ca', width: 140, align: 'center' as const, render: (v: boolean) => v ? <Tag color="green">✓ Yes</Tag> : <Tag color="default">—</Tag> },
              { title: 'Sales Executive', dataIndex: 'sales_executive', key: 'se', width: 140, align: 'center' as const, render: (v: boolean) => v ? <Tag color="green">✓ Yes</Tag> : <Tag color="default">—</Tag> },
            ]}
            pagination={false}
            rowKey="key"
          />
        </Card>
      </PageSection>

      <Modal
        title="Invite team member"
        open={inviteOpen}
        onCancel={() => { setInviteOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="Send invite"
        confirmLoading={inviting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => void handleInvite(v)} style={{ marginTop: 16 }}>
          <Form.Item
            name="email"
            label="Email address"
            rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}
          >
            <Input placeholder="colleague@company.com" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="roleSlug"
            label="Role"
            rules={[{ required: true, message: 'Select a role' }]}
          >
            <Select
              placeholder="Choose a role"
              options={ROLE_OPTIONS.map((r) => ({
                label: (
                  <Space direction="vertical" size={0}>
                    <Text strong>{r.label}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{r.description}</Text>
                  </Space>
                ),
                value: r.value,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="Temporary password (optional)"
            extra="If blank, an invite email is sent. If set, the account is created with this password."
          >
            <Input.Password placeholder="Leave blank to send invite email" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Flex>
  );
}
