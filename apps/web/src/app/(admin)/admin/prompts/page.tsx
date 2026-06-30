
import { useEffect, useState } from 'react';
import { Table, Button, Card, App, Skeleton, Modal, Form, Input, Select, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const AI_PROMPT_AGENTS = ['opportunity_analysis', 'company_research', 'proposal_generation', 'email_drafting'];

interface PromptRow {
  id: string;
  agent: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

interface PromptFormValues {
  agent: string;
  name: string;
  systemPrompt: string;
  outputSchema: string;
}

export default function AdminPromptsPage() {
  const { accessToken, currentOrg, isPlatformAdmin } = useAuth();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const fetchPrompts = async () => {
    if (!accessToken || !isPlatformAdmin) return;
    setLoading(true);
    try {
      const res = await api.adminPrompts({ accessToken, organizationId: currentOrg?.organizationId ?? '' });
      setPrompts(res.items);
    } catch (err: unknown) {
      const error = err as Error;
      message.error(error.message || 'Failed to fetch prompts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, [accessToken, isPlatformAdmin]);

  const handleCreate = async (values: PromptFormValues) => {
    if (!accessToken || !currentOrg) return;
    setCreating(true);
    try {
      await api.createAdminPrompt(
        { accessToken, organizationId: currentOrg.organizationId },
        { ...values, isActive: true }
      );
      message.success('System Prompt created successfully');
      form.resetFields();
      setModalOpen(false);
      fetchPrompts();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to create prompt');
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    {
      title: 'Agent',
      dataIndex: 'agent',
      key: 'agent',
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Active',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => active ? <Tag color="green">Active</Tag> : <Tag color="default">Inactive</Tag>,
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => new Date(val).toLocaleString(),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Global AI Prompts"
        subtitle="Manage system prompts used across all workspaces."
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={fetchPrompts} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Create Prompt Version
            </Button>
          </>
        }
      />

      <Card variant="borderless">
        {loading && prompts.length === 0 ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : (
          <Table 
            columns={columns} 
            dataSource={prompts} 
            rowKey="id"
            pagination={false} 
          />
        )}
      </Card>

      <Modal
        title="Create New System Prompt"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
        width={800}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="agent" label="Agent" rules={[{ required: true }]}>
            <Select>
              {AI_PROMPT_AGENTS.map((agent) => (
                <Select.Option key={agent} value={agent}>{agent}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="name" label="Version Name" rules={[{ required: true }]}>
            <Input placeholder="v1.0.0" />
          </Form.Item>
          <Form.Item name="systemPrompt" label="System Prompt" rules={[{ required: true }]}>
            <Input.TextArea rows={6} />
          </Form.Item>
          <Form.Item name="outputSchema" label="Output Schema (JSON)" rules={[{ required: true }]}>
            <Input.TextArea rows={4} style={{ fontFamily: 'monospace' }} placeholder="{}" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={creating} block>
            Create & Activate Prompt
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
