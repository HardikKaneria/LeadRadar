'use client';

import React, { useEffect, useState } from 'react';
import { Table, Tag, Typography, Button, message, Popconfirm, Descriptions, Card, Space, Modal } from 'antd';
import { CheckCircleOutlined, InfoCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { ScoringStrategyDto } from '@radar/contracts';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;

export function ScoringStrategiesList() {
  const { session, currentOrg } = useAuth();
  const [strategies, setStrategies] = useState<ScoringStrategyDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const loadStrategies = async () => {
    if (!session || !currentOrg) return;
    setLoading(true);
    try {
      const data = await api.listScoringStrategies({
        accessToken: session.access_token,
        organizationId: currentOrg.organizationId,
      });
      setStrategies(data);
    } catch (err: any) {
      message.error(err.message || 'Failed to load strategies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStrategies();
  }, [session, currentOrg]);

  const handleActivate = async (id: string) => {
    if (!session || !currentOrg) return;
    setActivatingId(id);
    try {
      await api.activateScoringStrategy(
        { accessToken: session.access_token, organizationId: currentOrg.organizationId },
        id
      );
      message.success('Strategy activated successfully');
      loadStrategies();
    } catch (err: any) {
      message.error(err.message || 'Failed to activate strategy');
    } finally {
      setActivatingId(null);
    }
  };

  const columns = [
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      render: (v: number, record: ScoringStrategyDto) => (
        <Space>
          <Text strong>v{v}</Text>
          {record.isActive && <Tag color="success" icon={<CheckCircleOutlined />}>Active</Tag>}
        </Space>
      ),
    },
    {
      title: 'Kind',
      dataIndex: 'kind',
      key: 'kind',
      render: (kind: string) => (
        <Tag color={kind === 'statistical' ? 'blue' : kind === 'ml' ? 'purple' : 'default'}>
          {kind}
        </Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('MMM D, YYYY'),
    },
    {
      title: 'Weights',
      key: 'weights',
      render: (_: any, record: ScoringStrategyDto) => (
        <Button 
          type="link" 
          size="small" 
          onClick={() => {
            Modal.info({
              title: `Strategy v${record.version} Weights`,
              width: 600,
              content: (
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    These are the learned statistical weights applied to base lead scores.
                  </Text>
                  {Object.keys(record.weights || {}).length > 0 ? (
                    <Descriptions bordered size="small" column={1}>
                      {Object.entries(record.weights).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([key, weight]) => (
                        <Descriptions.Item key={key} label={key}>
                          <Text type={(weight as number) > 1 ? 'success' : (weight as number) < 1 ? 'danger' : 'secondary'}>
                            {(weight as number).toFixed(2)}x
                          </Text>
                        </Descriptions.Item>
                      ))}
                    </Descriptions>
                  ) : (
                    <Text type="secondary">No weights defined.</Text>
                  )}
                  
                  {record.metrics && Object.keys(record.metrics).length > 0 && (
                    <>
                      <Text strong style={{ display: 'block', marginTop: 24, marginBottom: 8 }}>Metrics</Text>
                      <pre style={{ padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                        {JSON.stringify(record.metrics, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              ),
              maskClosable: true,
            });
          }}
        >
          View Weights
        </Button>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: ScoringStrategyDto) => (
        <Popconfirm
          title="Activate this strategy?"
          description="Future leads will be scored using this strategy's weights."
          onConfirm={() => handleActivate(record.id)}
          okText="Activate"
          cancelText="Cancel"
          disabled={record.isActive}
        >
          <Button 
            size="small" 
            type={record.isActive ? 'default' : 'primary'}
            disabled={record.isActive}
            loading={activatingId === record.id}
          >
            {record.isActive ? 'Active' : 'Activate'}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card 
      size="small"
      title={<><ThunderboltOutlined style={{ marginRight: 8, color: '#faad14' }} /> Scoring Strategies</>}
      style={{ marginBottom: 24 }}
      extra={
        <Button 
          icon={<InfoCircleOutlined />} 
          type="text" 
          onClick={() => message.info('Trigger a recompute in the Knowledge Insights dashboard.')}
        >
          How does this work?
        </Button>
      }
    >
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        The Learning Engine automatically computes statistical weights based on historical win-rates to improve score accuracy. 
        You can review historical strategies and roll back if needed.
      </Paragraph>
      <Table 
        dataSource={strategies} 
        columns={columns} 
        rowKey="id" 
        pagination={{ pageSize: 5 }} 
        loading={loading}
        size="small"
      />
    </Card>
  );
}
