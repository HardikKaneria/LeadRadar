
import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Card, App, Skeleton, Modal, Form, Input, Popconfirm, Flex } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { generatePassword } from '@/lib/password';
import dayjs from 'dayjs';

interface OrgRow {
  id: string;
  name: string;
  created_at: string;
}

export default function AdminCompaniesPage() {
  const { reload: reloadAuth, accessToken, currentOrg } = useAuth();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      message.error(error.message);
    } else {
      setOrgs((data as OrgRow[]) ?? []);
    }
    setLoading(false);
  }, [message]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const handleCreate = async (values: { orgName: string; ownerEmail: string; ownerName: string; password?: string }) => {
    if (!accessToken || !currentOrg) return;
    setCreating(true);
    try {
      await api.adminProvisionCompany(
        { accessToken, organizationId: currentOrg.organizationId },
        values
      );
      message.success(`Created workspace: ${values.orgName}`);
      form.resetFields();
      setModalOpen(false);
      await reloadAuth();
      await fetchOrgs();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to create company');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (orgId: string) => {
    if (!accessToken || !currentOrg) return;
    try {
      await api.deleteAdminCompany(
        { accessToken, organizationId: currentOrg.organizationId },
        orgId
      );
      message.success('Company deleted successfully');
      await fetchOrgs();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Failed to delete company');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val: string) => dayjs(val).format('MMM D, YYYY'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: OrgRow) => (
        <Popconfirm
          title="Delete Company"
          description={`Are you sure you want to delete ${record.name}? This will permanently delete the company and all associated users.`}
          onConfirm={() => handleDelete(record.id)}
          okText="Yes, delete"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button danger type="text" icon={<DeleteOutlined />} size="small">
            Delete
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Companies"
        subtitle="All organizations registered on the platform."
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={fetchOrgs} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Create Company
            </Button>
          </>
        }
      />

      <Card variant="borderless">
        {loading && orgs.length === 0 ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : (
          <Table
            columns={columns}
            dataSource={orgs}
            rowKey="id"
            pagination={{ pageSize: 20 }}
          />
        )}
      </Card>

      <Modal
        title="Create Company"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item
            name="orgName"
            label="Company Name"
            rules={[{ required: true, message: 'Please enter a company name' }]}
          >
            <Input size="large" placeholder="Acme Corp" />
          </Form.Item>
          <Form.Item
            name="ownerName"
            label="Owner Name"
            rules={[{ required: true, message: 'Please enter the owner name' }]}
          >
            <Input size="large" placeholder="John Doe" />
          </Form.Item>
          <Form.Item
            name="ownerEmail"
            label="Owner Email"
            rules={[{ required: true, type: 'email', message: 'Please enter a valid email' }]}
          >
            <Input size="large" placeholder="john@acme.com" />
          </Form.Item>
          <Form.Item name="password" label="Temporary Password (Optional)" tooltip="If provided, the user will be created immediately without waiting for an email invite.">
            <Input.Password size="large" placeholder="Auto-generate or type..." />
          </Form.Item>
          <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
            <Button type="dashed" onClick={() => form.setFieldsValue({ password: generatePassword() })}>
              Generate Strong Password
            </Button>
            <Button type="primary" htmlType="submit" loading={creating}>
              Create
            </Button>
          </Flex>
        </Form>
      </Modal>
    </div>
  );
}
