import { useEffect, useState } from 'react';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { LEAD_STAGES, OUTREACH_CHANNELS, type LeadStage, type OutreachChannel, type MessageTemplate } from '@radar/contracts';
import { listMessageTemplates, upsertMessageTemplate, deleteMessageTemplate } from '@/lib/outreach';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';

const { Text } = Typography;

interface TemplateFormValues {
  name: string;
  channel: OutreachChannel;
  service?: string | null;
  stage?: LeadStage | null;
  subjectTemplate?: string | null;
  bodyTemplate: string;
  tone?: string | null;
  isActive: boolean;
}

function toLabel(value: string): string {
  if (!value) return '';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function SettingsTemplatesPage() {
  const { currentOrg, can } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm<TemplateFormValues>();

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const canManage = can('ai.settings.manage');

  useEffect(() => {
    if (!currentOrg) return;
    loadTemplates();
  }, [currentOrg]);

  async function loadTemplates() {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const data = await listMessageTemplates(currentOrg.organizationId);
      setTemplates(data);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({
      isActive: true,
      channel: 'email',
    });
    setDrawerOpen(true);
  }

  function handleEdit(record: MessageTemplate) {
    setEditingTemplate(record);
    form.resetFields();
    form.setFieldsValue({
      name: record.name,
      channel: record.channel,
      service: record.service,
      stage: record.stage,
      subjectTemplate: record.subjectTemplate,
      bodyTemplate: record.bodyTemplate,
      tone: record.tone,
      isActive: record.isActive,
    });
    setDrawerOpen(true);
  }

  async function handleDelete(record: MessageTemplate) {
    if (!currentOrg) return;
    try {
      await deleteMessageTemplate(currentOrg.organizationId, record.id);
      message.success('Template deleted');
      loadTemplates();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to delete template');
    }
  }

  async function handleSubmit(values: TemplateFormValues) {
    if (!currentOrg) return;
    setSaving(true);
    try {
      await upsertMessageTemplate(currentOrg.organizationId, {
        id: editingTemplate?.id,
        name: values.name,
        channel: values.channel,
        service: values.service ?? undefined,
        stage: values.stage ?? undefined,
        subjectTemplate: values.subjectTemplate ?? undefined,
        bodyTemplate: values.bodyTemplate,
        tone: values.tone ?? undefined,
        isActive: values.isActive,
      });
      message.success(editingTemplate ? 'Template updated' : 'Template created');
      setDrawerOpen(false);
      loadTemplates();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Channel',
      dataIndex: 'channel',
      key: 'channel',
      render: (channel: OutreachChannel) => <Tag>{toLabel(channel)}</Tag>,
    },
    {
      title: 'Stage',
      dataIndex: 'stage',
      key: 'stage',
      render: (stage: LeadStage | null) => (stage ? <Tag color="blue">{toLabel(stage)}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: 'Service',
      dataIndex: 'service',
      key: 'service',
      render: (service: string | null) => (service ? service : <Text type="secondary">—</Text>),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (isActive ? <Tag color="success">Active</Tag> : <Tag color="default">Inactive</Tag>),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: MessageTemplate) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={!canManage} />
          <Popconfirm title="Delete template?" onConfirm={() => handleDelete(record)} disabled={!canManage}>
            <Button type="text" danger icon={<DeleteOutlined />} disabled={!canManage} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Message Templates"
        subtitle="Manage tone-controlled message templates used by the AI Sales Assistant for drafting outreach."
        extra={
          canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              New Template
            </Button>
          )
        }
      />

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          dataSource={templates}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Drawer
        title={editingTemplate ? 'Edit Template' : 'New Template'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={() => form.submit()} loading={saving}>
              Save
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Template Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Initial Outreach - Cold" />
          </Form.Item>

          <Space size="large" style={{ display: 'flex', marginBottom: 24 }}>
            <Form.Item name="channel" label="Channel" rules={[{ required: true }]} style={{ marginBottom: 0, minWidth: 150 }}>
              <Select>
                {OUTREACH_CHANNELS.map((ch) => (
                  <Select.Option key={ch} value={ch}>
                    {toLabel(ch)}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item name="isActive" label="Status" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
            </Form.Item>
          </Space>

          <Form.Item name="stage" label="Lead Stage (Optional)" help="Only use this template for leads in this pipeline stage">
            <Select allowClear placeholder="Any stage">
              {LEAD_STAGES.map((s) => (
                <Select.Option key={s} value={s}>
                  {toLabel(s)}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="service" label="Target Service (Optional)" help="Only use this template when pitching this specific service">
            <Input placeholder="e.g. Web Development" />
          </Form.Item>

          <Form.Item name="tone" label="Tone Directives (Optional)" help="Instruct the AI how to write (e.g. 'Keep it under 3 sentences, confident but casual')">
            <Input.TextArea rows={2} placeholder="e.g. Direct, professional, no fluff" />
          </Form.Item>

          <Form.Item name="subjectTemplate" label="Subject Template (Optional)" help="You can use variables like {{company_name}}, {{contact_name}}">
            <Input placeholder="e.g. Ideas for {{company_name}}" />
          </Form.Item>

          <Form.Item name="bodyTemplate" label="Body Template" rules={[{ required: true, message: 'Body template is required' }]} help="The main prompt or structure for the message. Use variables like {{company_name}}, {{sender_name}}, {{service}}.">
            <Input.TextArea rows={8} placeholder="Hi {{contact_name}},\n\nI noticed..." />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
