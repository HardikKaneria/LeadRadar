import { useEffect, useState } from 'react';
import { Table, Tag, Button, Card, App, Skeleton, Modal, Form, Input, Select, Tabs, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AdminApiKeyDto, AdminProviderAccountDto } from '@radar/contracts';

const PROVIDERS = ['gemini', 'groq', 'openrouter', 'jina'];
const ACCOUNT_TYPES = [
  { value: 'free_tier', label: 'Free Tier' },
  { value: 'paid', label: 'Paid' },
  { value: 'self_hosted', label: 'Self Hosted' },
];

export default function AdminAiProvidersPage() {
  const { accessToken, currentOrg, isPlatformAdmin } = useAuth();
  const { message } = App.useApp();
  const ctx = { accessToken: accessToken ?? '', organizationId: currentOrg?.organizationId ?? '' };

  const [accounts, setAccounts] = useState<AdminProviderAccountDto[]>([]);
  const [keys, setKeys] = useState<AdminApiKeyDto[]>([]);
  const [loading, setLoading] = useState(true);

  // Account modal
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountForm] = Form.useForm();

  // Key modal
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);
  const [keyForm] = Form.useForm();

  async function fetchAll() {
    if (!accessToken || !isPlatformAdmin) return;
    setLoading(true);
    try {
      const [acctRes, keyRes] = await Promise.all([
        api.adminProviderAccounts(ctx),
        api.adminApiKeys(ctx),
      ]);
      setAccounts(acctRes.items);
      setKeys(keyRes.items);
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void fetchAll(); }, [accessToken, isPlatformAdmin]);

  // ── Accounts ────────────────────────────────────────────────────────────────

  async function handleCreateAccount(values: { provider: string; accountType: string; accountName: string }) {
    setCreatingAccount(true);
    try {
      await api.createAdminProviderAccount(ctx, values);
      void message.success('Account created');
      accountForm.resetFields();
      setAccountModalOpen(false);
      void fetchAll();
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setCreatingAccount(false);
    }
  }

  async function handleDeleteAccount(id: string) {
    try {
      await api.deleteAdminProviderAccount(ctx, id);
      void message.success('Account deleted');
      void fetchAll();
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  const accountColumns = [
    { title: 'Name', dataIndex: 'accountName', key: 'accountName', render: (v: string | null) => v ?? '—' },
    { title: 'Provider', dataIndex: 'provider', key: 'provider', render: (v: string) => <strong>{v}</strong> },
    { title: 'Type', dataIndex: 'accountType', key: 'accountType' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={s === 'active' ? 'blue' : 'red'}>{s.toUpperCase()}</Tag>,
    },
    { title: 'Usage/month', dataIndex: 'monthlyUsage', key: 'monthlyUsage', render: (v: number) => `$${Number(v || 0).toFixed(4)}` },
    {
      title: 'Keys',
      key: 'keyCount',
      render: (_: unknown, row: AdminProviderAccountDto) => keys.filter((k) => k.providerAccountId === row.id).length,
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, row: AdminProviderAccountDto) => (
        <Popconfirm
          title="Delete this account and all its keys?"
          onConfirm={() => void handleDeleteAccount(row.id)}
          okText="Delete"
          okButtonProps={{ danger: true }}
        >
          <Button danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  // ── Keys ─────────────────────────────────────────────────────────────────────

  async function handleCreateKey(values: { providerAccountId: string; apiKey: string; keyName?: string }) {
    setCreatingKey(true);
    try {
      await api.createAdminApiKey(ctx, values);
      void message.success('API key added');
      keyForm.resetFields();
      setKeyModalOpen(false);
      void fetchAll();
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleDeleteKey(id: string) {
    try {
      await api.deleteAdminApiKey(ctx, id);
      void message.success('Key deleted');
      void fetchAll();
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  const accountLabel = (id: string) => {
    const acct = accounts.find((a) => a.id === id);
    return acct ? `${acct.provider} — ${acct.accountName ?? acct.id.slice(0, 8)}` : id.slice(0, 8);
  };

  const keyColumns = [
    { title: 'Key Name', dataIndex: 'keyName', key: 'keyName', render: (v: string | null) => v ?? '—' },
    { title: 'Provider', dataIndex: 'provider', key: 'provider', render: (v: string) => <strong>{v}</strong> },
    {
      title: 'Account',
      dataIndex: 'providerAccountId',
      key: 'providerAccountId',
      render: (id: string) => <span style={{ fontSize: 12, color: '#666' }}>{accountLabel(id)}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s: string, row: AdminApiKeyDto) => (
        <>
          <Tag color={s === 'active' ? 'blue' : s === 'cooldown' ? 'orange' : 'red'}>{s.toUpperCase()}</Tag>
          {s === 'cooldown' && row.cooldownUntil ? (
            <div style={{ fontSize: 11, color: '#888' }}>until {new Date(row.cooldownUntil).toLocaleTimeString()}</div>
          ) : null}
        </>
      ),
    },
    { title: 'Req today', dataIndex: 'requestsUsedToday', key: 'requestsUsedToday', render: (n: number) => n ?? 0 },
    { title: 'Tokens/month', dataIndex: 'tokensUsedMonth', key: 'tokensUsedMonth', render: (n: number) => Number(n || 0).toLocaleString() },
    { title: 'Cost/month', dataIndex: 'costUsedMonth', key: 'costUsedMonth', render: (n: number) => `$${Number(n || 0).toFixed(4)}` },
    {
      title: 'Last error',
      dataIndex: 'lastError',
      key: 'lastError',
      render: (e: string | null) => e ? <span style={{ color: 'red', fontSize: 12 }}>{e}</span> : '—',
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, row: AdminApiKeyDto) => (
        <Popconfirm
          title="Delete this API key?"
          onConfirm={() => void handleDeleteKey(row.id)}
          okText="Delete"
          okButtonProps={{ danger: true }}
        >
          <Button danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="AI Providers & Key Pool"
        subtitle="Manage provider accounts and their API keys. Keys are shared across all organisations."
        extra={<Button icon={<ReloadOutlined />} onClick={() => void fetchAll()} loading={loading}>Refresh</Button>}
      />

      <Card variant="borderless">
        {loading && accounts.length === 0 ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : (
          <Tabs
            items={[
              {
                key: 'accounts',
                label: `Accounts (${accounts.length})`,
                children: (
                  <>
                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => setAccountModalOpen(true)}>
                        Add Account
                      </Button>
                    </div>
                    <Table columns={accountColumns} dataSource={accounts} rowKey="id" pagination={false} />
                  </>
                ),
              },
              {
                key: 'keys',
                label: `API Keys (${keys.length})`,
                children: (
                  <>
                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        disabled={accounts.length === 0}
                        onClick={() => setKeyModalOpen(true)}
                      >
                        Add Key
                      </Button>
                    </div>
                    <Table columns={keyColumns} dataSource={keys} rowKey="id" pagination={false} />
                  </>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Add Account modal */}
      <Modal
        title="Add Provider Account"
        open={accountModalOpen}
        onCancel={() => setAccountModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={accountForm} layout="vertical" onFinish={handleCreateAccount} style={{ marginTop: 16 }}>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select options={PROVIDERS.map((p) => ({ value: p, label: p }))} />
          </Form.Item>
          <Form.Item name="accountType" label="Account Type" rules={[{ required: true }]}>
            <Select options={ACCOUNT_TYPES} />
          </Form.Item>
          <Form.Item name="accountName" label="Account Name" rules={[{ required: true }]} tooltip="e.g. 'Groq free #1'">
            <Input placeholder="e.g. Groq free #1" maxLength={80} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={creatingAccount} block>
            Create Account
          </Button>
        </Form>
      </Modal>

      {/* Add Key modal */}
      <Modal
        title="Add API Key"
        open={keyModalOpen}
        onCancel={() => setKeyModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={keyForm} layout="vertical" onFinish={handleCreateKey} style={{ marginTop: 16 }}>
          <Form.Item name="providerAccountId" label="Account" rules={[{ required: true }]} tooltip="Which account this key belongs to">
            <Select
              showSearch
              optionFilterProp="label"
              options={accounts.map((a) => ({
                value: a.id,
                label: `${a.provider} — ${a.accountName ?? a.id.slice(0, 8)} (${a.accountType})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="keyName" label="Key Name" tooltip="Optional label, e.g. 'Groq key #2'">
            <Input placeholder="e.g. Groq key #2" maxLength={80} />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key" rules={[{ required: true }]}>
            <Input.Password placeholder="sk-..." />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={creatingKey} block>
            Save Key
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
