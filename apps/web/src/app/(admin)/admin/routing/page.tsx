import { useEffect, useState } from 'react';
import { Table, Button, Card, App, Skeleton, Modal, Form, Input, Select, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { api, type AdminRoute, type AdminRouteUpdate } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const PROVIDERS = ['gemini', 'groq', 'openrouter', 'ollama', 'openai', 'anthropic', 'jina'];

export default function AdminRoutingPage() {
  const { accessToken, currentOrg, isPlatformAdmin } = useAuth();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<AdminRoute[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<AdminRoute | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const fetchRoutes = async () => {
    if (!accessToken || !isPlatformAdmin) return;
    setLoading(true);
    try {
      const res = await api.adminRoutes({ accessToken, organizationId: currentOrg?.organizationId ?? '' });
      setRoutes(res.items);
    } catch (err: unknown) {
      const error = err as Error;
      message.error(error.message || 'Failed to fetch routes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, [accessToken, isPlatformAdmin]);

  const handleEdit = (route: AdminRoute) => {
    setEditingRoute(route);
    form.setFieldsValue({
      primary_provider: route.primary_provider,
      primary_model: route.primary_model,
      fallback_provider: route.fallback_provider,
      fallback_model: route.fallback_model,
      fallback_2_provider: route.fallback_2_provider,
      fallback_2_model: route.fallback_2_model,
    });
    setModalOpen(true);
  };

  const handleSave = async (values: AdminRouteUpdate) => {
    if (!accessToken || !currentOrg || !editingRoute) return;
    setSaving(true);
    try {
      await api.updateAdminRoute(
        { accessToken, organizationId: currentOrg.organizationId },
        editingRoute.task_type,
        values
      );
      message.success('Route updated successfully');
      setModalOpen(false);
      fetchRoutes();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to save route');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Task Type',
      dataIndex: 'task_type',
      key: 'task_type',
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: 'Primary',
      key: 'primary',
      render: (_: unknown, record: AdminRoute) => (
        <Tag color="blue">{record.primary_provider}: {record.primary_model}</Tag>
      ),
    },
    {
      title: 'Fallback 1',
      key: 'fallback_1',
      render: (_: unknown, record: AdminRoute) => record.fallback_provider ? (
        <Tag color="orange">{record.fallback_provider}: {record.fallback_model}</Tag>
      ) : '-',
    },
    {
      title: 'Fallback 2',
      key: 'fallback_2',
      render: (_: unknown, record: AdminRoute) => record.fallback_2_provider ? (
        <Tag color="orange">{record.fallback_2_provider}: {record.fallback_2_model}</Tag>
      ) : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: AdminRoute) => (
        <Button onClick={() => handleEdit(record)} size="small">Edit Routing</Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="AI Task Routing"
        subtitle="Configure primary and fallback AI providers for each task type."
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchRoutes} loading={loading}>
            Refresh
          </Button>
        }
      />

      <Card variant="borderless">
        {loading && routes.length === 0 ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : (
          <Table 
            columns={columns} 
            dataSource={routes} 
            rowKey="task_type"
            pagination={false} 
          />
        )}
      </Card>

      <Modal
        title={`Edit Route: ${editingRoute?.task_type}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          <Card size="small" title="Primary Provider" style={{ marginBottom: 16 }}>
            <Form.Item name="primary_provider" label="Provider" rules={[{ required: true }]}>
              <Select options={PROVIDERS.map(p => ({ label: p, value: p }))} />
            </Form.Item>
            <Form.Item name="primary_model" label="Model ID" rules={[{ required: true }]}>
              <Input placeholder="e.g. gemini-1.5-flash" />
            </Form.Item>
          </Card>

          <Card size="small" title="Fallback Provider 1" style={{ marginBottom: 16 }}>
            <Form.Item name="fallback_provider" label="Provider">
              <Select allowClear options={PROVIDERS.map(p => ({ label: p, value: p }))} />
            </Form.Item>
            <Form.Item name="fallback_model" label="Model ID">
              <Input placeholder="e.g. llama-3.1-8b-instant" />
            </Form.Item>
          </Card>

          <Card size="small" title="Fallback Provider 2" style={{ marginBottom: 16 }}>
            <Form.Item name="fallback_2_provider" label="Provider">
              <Select allowClear options={PROVIDERS.map(p => ({ label: p, value: p }))} />
            </Form.Item>
            <Form.Item name="fallback_2_model" label="Model ID">
              <Input placeholder="e.g. llama-3.1-8b-instant" />
            </Form.Item>
          </Card>

          <Button type="primary" htmlType="submit" loading={saving} block>
            Save Routes
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
