'use client';

import { useEffect, useState } from 'react';
import { Card, Table, Typography, Tag, Empty, message } from 'antd';
import { RiseOutlined, FallOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { PageSection } from '@/components/ui/page-section';
import type { DemandRadarClusterDto } from '@radar/contracts';

const { Text } = Typography;

export default function DemandRadarPage() {
  const { session, currentOrg } = useAuth();
  const accessToken = session?.access_token || '';
  const organizationId = currentOrg?.organizationId ?? '';
  const [clusters, setClusters] = useState<DemandRadarClusterDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!accessToken) return;
      setIsLoading(true);
      try {
        const data = await api.getDemandRadar({ accessToken, organizationId });
        setClusters(data);
      } catch (err: any) {
        message.error(`Failed to load demand radar: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [accessToken]);

  const columns = [
    {
      title: 'Trending Theme',
      dataIndex: 'title',
      key: 'title',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Volume (Last 30 Days)',
      dataIndex: 'volume',
      key: 'volume',
    },
    {
      title: 'Velocity (Growth %)',
      dataIndex: 'velocity',
      key: 'velocity',
      render: (val: number) => {
        const isPositive = val > 0;
        const color = isPositive ? 'success' : 'error';
        const Icon = isPositive ? RiseOutlined : FallOutlined;
        return (
          <Tag color={color} icon={<Icon />}>
            {val.toFixed(1)}%
          </Tag>
        );
      },
    },
    {
      title: 'Average Score',
      dataIndex: 'avgScore',
      key: 'avgScore',
      render: (val: number) => <Text>{val.toFixed(0)}</Text>,
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader 
        title="Demand Radar" 
        subtitle="AI-clustered opportunity themes based on similarity and volume" 
      />
      
      <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
        <PageSection title="Trending Themes" className="max-w-5xl mx-auto">
          <Card bordered={false} className="shadow-sm">
            {clusters && clusters.length > 0 ? (
              <Table 
                dataSource={clusters} 
                columns={columns}
                rowKey="clusterId"
                pagination={false}
                loading={isLoading}
              />
            ) : (
              <Empty description={isLoading ? "Loading clusters..." : "Not enough opportunity volume to form clusters yet."} />
            )}
          </Card>
        </PageSection>
      </div>
    </div>
  );
}
