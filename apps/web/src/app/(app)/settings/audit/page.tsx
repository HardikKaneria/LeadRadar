import { useEffect, useState } from 'react';
import { Card, Table, Tag } from 'antd';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import dayjs from 'dayjs';

export default function AuditPage() {
  const { session, currentOrg } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.access_token || !currentOrg?.organizationId) return;
    const ctx = { accessToken: session.access_token, organizationId: currentOrg.organizationId };
    api.request('/audit/logs', ctx)
      .then(res => setLogs(res as any[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session, currentOrg]);

  const columns = [
    {
      title: 'Timestamp',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('MMM D, YYYY HH:mm:ss'),
      width: 200,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const isBilling = type.startsWith('Billing');
        return <Tag color={isBilling ? 'blue' : 'purple'}>{type}</Tag>;
      },
      width: 200,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
    },
    {
      title: 'Details',
      dataIndex: 'details',
      key: 'details',
      render: (details: any) => (
        <pre style={{ fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 4, margin: 0, maxHeight: 96, overflow: 'auto' }}>
          {JSON.stringify(details, null, 2)}
        </pre>
      )
    },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        eyebrow="Settings"
        title="Audit Logs"
        subtitle="View system activity, billing events, and AI requests."
      />

      <Card style={{ marginTop: 24 }} styles={{ body: { padding: 0 } }}>
        <Table
          loading={loading}
          dataSource={logs}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          size="middle"
        />
      </Card>
    </div>
  );
}
