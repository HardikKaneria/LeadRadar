import { ArrowRightOutlined } from '@ant-design/icons';
import type { LeadHuntingPostSummary } from '@radar/contracts';
import { Button, Flex, Progress, Space, Table, Tag, Tooltip, Typography, type TableProps } from 'antd';
import { EmptyState } from '@/components/ui/empty-state';
import { LeadHuntingClassificationTag, RawPostStatusTag, ScoreTag } from '@/components/ui/status-tag';

const { Paragraph, Text } = Typography;

function snippet(value: string | null): string {
  if (!value) return 'No captured post text.';
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

export function LeadHuntingPostsTable({
  items,
  loading,
  onOpen,
  showSession = true,
  emptyDescription,
}: {
  items: LeadHuntingPostSummary[];
  loading?: boolean;
  onOpen: (item: LeadHuntingPostSummary) => void;
  showSession?: boolean;
  emptyDescription: React.ReactNode;
}) {
  const columns: TableProps<LeadHuntingPostSummary>['columns'] = [
    {
      title: 'Post',
      key: 'post',
      render: (_value, row) => (
        <Flex vertical gap={6} style={{ minWidth: 280 }}>
          <Space wrap size={[8, 8]}>
            <Text strong>{row.postOwnerName ?? 'Unknown author'}</Text>
            {row.visibleCompanyName ? <Tag>{row.visibleCompanyName}</Tag> : null}
            {row.postDate ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(row.postDate).toLocaleDateString()}
              </Text>
            ) : null}
          </Space>
          <Paragraph style={{ margin: 0 }} ellipsis={{ rows: 2 }}>
            {snippet(row.postText)}
          </Paragraph>
          {showSession && row.searchSessionId ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Session {row.searchSessionId.slice(0, 8)}
            </Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (status: LeadHuntingPostSummary['status']) => <RawPostStatusTag status={status} />,
    },
    {
      title: 'Classification',
      key: 'classification',
      width: 220,
      render: (_value, row) =>
        row.classification ? (
          <Flex vertical gap={8}>
            <LeadHuntingClassificationTag classification={row.classification} />
            {row.leadScore != null ? <ScoreTag score={row.leadScore} /> : null}
          </Flex>
        ) : (
          <Text type="secondary">Pending</Text>
        ),
    },
    {
      title: 'Signals',
      key: 'signals',
      width: 250,
      render: (_value, row) => (
        <Flex vertical gap={8}>
          {row.missingSignals.length > 0 ? (
            <Space wrap size={[6, 6]}>
              {row.missingSignals.map((item) => (
                <Tooltip key={item} title="Operator cue">
                  <Tag color="warning">{item}</Tag>
                </Tooltip>
              ))}
            </Space>
          ) : (
            <Text type="secondary">No missing-field warnings</Text>
          )}
          {row.latestJobStatus ? (
            <Progress
              percent={Math.min(100, Math.max(0, row.latestJobProgress ?? 0))}
              size="small"
              status={row.latestJobStatus === 'failed' ? 'exception' : undefined}
            />
          ) : null}
        </Flex>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      align: 'right',
      render: (_value, row) => (
        <Button icon={<ArrowRightOutlined />} onClick={() => onOpen(row)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <Table<LeadHuntingPostSummary>
      rowKey="id"
      columns={columns}
      dataSource={items}
      loading={loading && items.length === 0}
      pagination={false}
      locale={{
        emptyText: <EmptyState description={emptyDescription} />,
      }}
    />
  );
}
