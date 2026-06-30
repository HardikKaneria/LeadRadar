import { useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Flex, Progress, Skeleton, Tag, Typography } from 'antd';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

const { Text } = Typography;

export default function BillingPage() {
  const { session, currentOrg } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.access_token || !currentOrg?.organizationId) return;
    const ctx = { accessToken: session.access_token, organizationId: currentOrg.organizationId };
    api.request('/billing/subscription', ctx)
      .then(res => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [session, currentOrg]);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px' }}>
      <PageHeader
        eyebrow="Settings"
        title="Billing & Usage"
        subtitle="Manage your subscription plan and monitor usage limits."
      />

      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} style={{ marginTop: 24 }} />
      ) : data ? (
        <Flex vertical gap={20} style={{ marginTop: 24 }}>
          <Card
            title="Current plan"
            extra={<Tag color={data.status === 'active' ? 'green' : 'red'}>{data.status?.toUpperCase()}</Tag>}
          >
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Plan"><Text strong>{data.plan?.name ?? '—'}</Text></Descriptions.Item>
              <Descriptions.Item label="Monthly price">${((data.plan?.monthlyPrice ?? 0) / 100).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="Period ends">
                {data.currentPeriodEnd ? new Date(data.currentPeriodEnd).toLocaleDateString() : 'N/A'}
              </Descriptions.Item>
            </Descriptions>
            <Flex gap={8} style={{ marginTop: 16 }}>
              <Button type="primary">Upgrade plan</Button>
              <Button>Manage billing portal</Button>
            </Flex>
          </Card>

          <Card title="Usage & limits">
            {!data.limits?.length ? (
              <Alert message="No specific usage limits found for this plan." type="info" showIcon />
            ) : (
              <Flex vertical gap={20}>
                {data.limits.map((limit: any) => (
                  <div key={limit.id}>
                    <Flex justify="space-between" style={{ marginBottom: 6 }}>
                      <Text strong>{limit.resourceType}</Text>
                      <Text type="secondary">0 / {limit.maxValue}</Text>
                    </Flex>
                    <Progress percent={0} status="active" />
                  </div>
                ))}
              </Flex>
            )}
          </Card>
        </Flex>
      ) : (
        <Alert
          message="No active subscription"
          description="No subscription found for this organization. Contact support to set up billing."
          type="warning"
          showIcon
          style={{ marginTop: 24 }}
        />
      )}
    </div>
  );
}
