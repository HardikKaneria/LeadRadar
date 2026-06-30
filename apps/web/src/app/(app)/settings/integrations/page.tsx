'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Typography, Tag, List, Modal, Form, Input, Select, message, Spin } from 'antd';
import { ApiOutlined, MailOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { PageSection } from '@/components/ui/page-section';
import type { IntegrationAccountDto } from '@radar/contracts';

const { Text } = Typography;
const { Option } = Select;

export default function IntegrationsPage() {
  const { session, currentOrg } = useAuth();
  const accessToken = session?.access_token || '';
  const organizationId = currentOrg?.organizationId ?? '';
  const [integrations, setIntegrations] = useState<IntegrationAccountDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadIntegrations();
  }, [accessToken]);

  const loadIntegrations = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await api.getIntegrations({ accessToken, organizationId });
      setIntegrations(data);
    } catch (err: any) {
      message.error(`Failed to load integrations: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (values: any) => {
    try {
      await api.connectIntegration({ accessToken, organizationId }, {
        provider: values.provider,
        type: values.type,
        credentials: { apiKey: values.apiKey }, // simplistic for now
        settings: {},
      });
      message.success('Integration connected successfully');
      setIsModalVisible(false);
      form.resetFields();
      loadIntegrations();
    } catch (err: any) {
      message.error(`Failed to connect integration: ${err.message}`);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await api.disconnectIntegration({ accessToken, organizationId }, id);
      message.success('Integration disconnected');
      loadIntegrations();
    } catch (err: any) {
      message.error(`Failed to disconnect integration: ${err.message}`);
    }
  };

  const showConnectModal = () => setIsModalVisible(true);

  if (loading) {
    return <div className="p-12 text-center"><Spin size="large" /></div>;
  }

  const aiIntegrations = integrations.filter(i => i.type === 'ai_provider');
  const emailIntegrations = integrations.filter(i => i.type === 'email');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Integrations"
        subtitle="Connect AI providers and email accounts to power LeadRadar"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={showConnectModal}>Connect Integration</Button>}
      />

      <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
        <PageSection title="AI Providers" className="max-w-4xl mx-auto mb-8">
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={aiIntegrations}
            renderItem={item => (
              <List.Item>
                <Card 
                  title={<><ApiOutlined className="mr-2" /> {item.provider}</>}
                  extra={<Tag color="success">Connected</Tag>}
                  actions={[
                    <Button key="disconnect" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDisconnect(item.id)}>
                      Disconnect
                    </Button>
                  ]}
                >
                  <Text type="secondary">Connected on {new Date(item.createdAt).toLocaleDateString()}</Text>
                </Card>
              </List.Item>
            )}
            locale={{ emptyText: 'No AI providers connected' }}
          />
        </PageSection>

        <PageSection title="Email Providers" className="max-w-4xl mx-auto">
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={emailIntegrations}
            renderItem={item => (
              <List.Item>
                <Card 
                  title={<><MailOutlined className="mr-2" /> {item.provider}</>}
                  extra={<Tag color="success">Connected</Tag>}
                  actions={[
                    <Button key="disconnect" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDisconnect(item.id)}>
                      Disconnect
                    </Button>
                  ]}
                >
                  <Text type="secondary">Connected on {new Date(item.createdAt).toLocaleDateString()}</Text>
                </Card>
              </List.Item>
            )}
            locale={{ emptyText: 'No email providers connected' }}
          />
        </PageSection>
      </div>

      <Modal
        title="Connect Integration"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleConnect}>
          <Form.Item name="type" label="Integration Type" rules={[{ required: true }]}>
            <Select placeholder="Select type">
              <Option value="ai_provider">AI Provider</Option>
              <Option value="email">Email</Option>
            </Select>
          </Form.Item>
          
          <Form.Item name="provider" label="Provider Name" rules={[{ required: true }]}>
            <Select placeholder="Select provider">
              <Option value="OpenAI">OpenAI</Option>
              <Option value="Anthropic">Anthropic</Option>
              <Option value="Gemini">Gemini</Option>
              <Option value="SMTP">SMTP (Email)</Option>
            </Select>
          </Form.Item>

          <Form.Item name="apiKey" label="API Key / Credentials" rules={[{ required: true }]}>
            <Input.Password placeholder="Enter credentials" />
          </Form.Item>

          <Form.Item className="mb-0 text-right">
            <Button onClick={() => setIsModalVisible(false)} className="mr-2">Cancel</Button>
            <Button type="primary" htmlType="submit">Connect</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
