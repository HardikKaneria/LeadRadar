import { useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Progress,
  Row,
  Skeleton,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  DollarOutlined,
  FundOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { RevenueForecastResult, StageForecastRow } from '@radar/contracts';
import { PageHeader } from '@/components/page-header';
import dayjs from 'dayjs';

const { Text } = Typography;

/** Canonical order for pipeline stages, newest → closest to close. */
const STAGE_ORDER = [
  'new',
  'contacted',
  'reply_received',
  'meeting_scheduled',
  'proposal_sent',
  'negotiation',
];

const STAGE_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  reply_received: 'Reply received',
  meeting_scheduled: 'Meeting scheduled',
  proposal_sent: 'Proposal sent',
  negotiation: 'Negotiation',
};

function fmt(value: number, currency: string | null): string {
  if (!currency) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
}

function PipelineFunnelBar({ rows, currency }: { rows: StageForecastRow[]; currency: string | null }) {
  const maxLeads = Math.max(1, ...rows.map((r) => r.leadCount));
  return (
    <Flex vertical gap={10}>
      {rows.map((row) => (
        <Flex key={row.stage} align="center" gap={12}>
          <Text style={{ width: 160, flexShrink: 0, fontSize: 13 }}>{STAGE_LABEL[row.stage] ?? row.stage}</Text>
          <Progress
            percent={Math.round((row.leadCount / maxLeads) * 100)}
            showInfo={false}
            style={{ flex: 1 }}
            strokeColor={row.leadCount === 0 ? 'var(--ant-color-border)' : undefined}
          />
          <Text style={{ width: 40, textAlign: 'right', fontSize: 13 }}>{row.leadCount}</Text>
          <Text type="secondary" style={{ width: 50, textAlign: 'right', fontSize: 12 }}>
            {Math.round(row.conversionProbability * 100)}%
          </Text>
          <Text strong style={{ width: 110, textAlign: 'right', fontSize: 13 }}>
            {row.weightedValue > 0 ? fmt(row.weightedValue, currency) : '—'}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}

const stageColumns = (currency: string | null) => [
  {
    title: 'Stage',
    dataIndex: 'stage',
    key: 'stage',
    render: (v: string) => <Text strong>{STAGE_LABEL[v] ?? v}</Text>,
  },
  {
    title: (
      <Tooltip title="Probability of closing from this stage (blended from benchmarks + your actual win rate)">
        Conv. prob <InfoCircleOutlined style={{ marginLeft: 4 }} />
      </Tooltip>
    ),
    dataIndex: 'conversionProbability',
    key: 'conversionProbability',
    render: (v: number) => <Tag color="blue">{Math.round(v * 100)}%</Tag>,
  },
  {
    title: 'Leads',
    dataIndex: 'leadCount',
    key: 'leadCount',
  },
  {
    title: (
      <Tooltip title="Deals without a value are excluded from weighted revenue">
        Unestimated <InfoCircleOutlined style={{ marginLeft: 4 }} />
      </Tooltip>
    ),
    dataIndex: 'unestimatedCount',
    key: 'unestimatedCount',
    render: (v: number) => v > 0 ? <Text type="secondary">{v}</Text> : '—',
  },
  {
    title: 'Pipeline value',
    dataIndex: 'totalValue',
    key: 'totalValue',
    render: (v: number | null) => v != null ? fmt(v, currency) : '—',
  },
  {
    title: (
      <Tooltip title="Expected revenue = conversion probability × deal value, summed across this stage">
        Weighted revenue <InfoCircleOutlined style={{ marginLeft: 4 }} />
      </Tooltip>
    ),
    dataIndex: 'weightedValue',
    key: 'weightedValue',
    render: (v: number) => (
      <Text strong style={{ color: v > 0 ? 'var(--ant-color-success)' : undefined }}>
        {v > 0 ? fmt(v, currency) : '—'}
      </Text>
    ),
  },
];

export default function ForecastPage() {
  const { accessToken, currentOrg, can } = useAuth();
  const { message } = App.useApp();
  const ctx = { accessToken: accessToken ?? '', organizationId: currentOrg?.organizationId ?? '' };

  const [forecast, setForecast] = useState<RevenueForecastResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!accessToken || !can('knowledge.read')) return;
    setLoading(true);
    try {
      const result = await api.getRevenueForecast(ctx);
      setForecast(result);
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [accessToken, currentOrg?.organizationId]);

  const currency = forecast?.dominantCurrency ?? null;
  const rows = [...(forecast?.byStage ?? [])].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage),
  );

  return (
    <Flex vertical gap={24}>
      <PageHeader
        title="Revenue Forecast"
        subtitle="Expected pipeline value weighted by stage-based conversion probability and deal score."
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            Refresh
          </Button>
        }
      />

      {loading && !forecast ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !forecast ? (
        <Empty description="No forecast data yet — add deals with values to your pipeline." />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="Expected revenue"
                  prefix={<DollarOutlined />}
                  value={fmt(forecast.totalWeightedValue, currency)}
                  valueStyle={{ color: 'var(--ant-color-success)' }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Weighted by stage conv. prob × score × deal value
                </Text>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="Active pipeline leads"
                  prefix={<FundOutlined />}
                  value={forecast.totalActiveLeads}
                />
                {forecast.totalUnestimated > 0 && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {forecast.totalUnestimated} without deal value (excluded)
                  </Text>
                )}
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="Estimated at"
                  value={dayjs(forecast.computedAt).format('MMM D, HH:mm')}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Recalculates live on refresh
                </Text>
              </Card>
            </Col>
          </Row>

          <Card title="Pipeline funnel" variant="borderless">
            <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 172 }}>Leads</Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto', marginRight: 110 }}>Conv. %</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>Weighted rev.</Text>
            </Flex>
            {rows.length === 0 ? (
              <Empty description="No active leads" />
            ) : (
              <PipelineFunnelBar rows={rows} currency={currency} />
            )}
          </Card>

          <Card title="Stage breakdown" variant="borderless">
            <Table
              columns={stageColumns(currency)}
              dataSource={rows}
              rowKey="stage"
              pagination={false}
              size="small"
            />
          </Card>
        </>
      )}
    </Flex>
  );
}
