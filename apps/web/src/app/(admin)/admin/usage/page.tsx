
import { useEffect, useState } from 'react';
import { Typography, Card, Table, Tag, App, Button, Skeleton } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { UsageEventSummary } from '@radar/contracts';

const columns = [
  {
    title: 'Org ID',
    dataIndex: 'organizationId',
    key: 'organizationId',
    render: (org: string) => <Typography.Text ellipsis style={{ width: 100 }}>{org}</Typography.Text>,
  },
  {
    title: 'Task Type',
    dataIndex: 'taskType',
    key: 'taskType',
  },
  {
    title: 'Model',
    dataIndex: 'model',
    key: 'model',
    render: (model: string) => <Tag>{model}</Tag>,
  },
  {
    title: 'Input',
    dataIndex: 'inputTokens',
    key: 'inputTokens',
  },
  {
    title: 'Output',
    dataIndex: 'outputTokens',
    key: 'outputTokens',
  },
  {
    title: 'Total Cost',
    dataIndex: 'estimatedCost',
    key: 'estimatedCost',
    render: (cost: number) => `$${Number(cost || 0).toFixed(4)}`,
  },
  {
    title: 'Date',
    dataIndex: 'createdAt',
    key: 'createdAt',
    render: (date: string) => new Date(date).toLocaleString(),
  },
];

export default function AdminUsagePage() {
  const { accessToken, currentOrg, isPlatformAdmin } = useAuth();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<UsageEventSummary[]>([]);

  const fetchUsage = async () => {
    if (!accessToken || !isPlatformAdmin) return;
    setLoading(true);
    try {
      const res = await api.adminUsageEvents(
        { accessToken, organizationId: currentOrg?.organizationId ?? '' },
        { page: 1, pageSize: 50 }
      );
      setEvents(res.items);
    } catch (err: unknown) {
      const error = err as Error;
      message.error(error.message || 'Failed to fetch usage events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, [accessToken, isPlatformAdmin]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Global AI Usage Ledger"
        subtitle="Monitor organization AI usage, token counts, and cost attributions."
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchUsage} loading={loading}>
            Refresh
          </Button>
        }
      />

      <Card variant="borderless">
        {loading && events.length === 0 ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Table 
            columns={columns} 
            dataSource={events} 
            rowKey="id"
            pagination={{ pageSize: 50 }} 
          />
        )}
      </Card>
    </div>
  );
}
