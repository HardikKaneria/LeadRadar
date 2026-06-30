import { useEffect, useMemo, useState } from 'react';
import { LinkOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Flex,
  Form,
  InputNumber,
  Result,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  type TableProps,
} from 'antd';
import type { LeadHuntingOverview, LeadHuntingSessionSummary } from '@radar/contracts';
import { useNavigate } from 'react-router-dom';
import { LeadHuntingPostsTable } from '@/components/lead-hunting/lead-hunting-posts-table';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { PageSection } from '@/components/ui/page-section';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const { Link, Text } = Typography;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function remainingTone(value: number | null): 'error' | 'warning' | 'default' {
  if (value == null) return 'default';
  if (value <= 0) return 'error';
  if (value <= 5) return 'warning';
  return 'default';
}

export default function LeadHuntingPage() {
  const navigate = useNavigate();
  const { accessToken, currentOrg, can } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<LeadHuntingOverview | null>(null);

  const ctx = useMemo(
    () =>
      accessToken && currentOrg
        ? { accessToken, organizationId: currentOrg.organizationId }
        : null,
    [accessToken, currentOrg],
  );

  const canRead = can('lead_hunting.read');
  const canManage = can('lead_hunting.manage');

  async function load() {
    if (!ctx || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const next = await api.leadHuntingOverview(ctx);
      setOverview(next);
      form.setFieldsValue(next.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lead-hunting overview.');
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [ctx, canRead]);

  async function saveSettings() {
    if (!ctx || !canManage) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const next = await api.updateLeadHuntingSettings(ctx, values);
      setOverview((current) => (current ? { ...current, settings: next } : current));
      message.success('Lead-hunting settings updated');
    } catch (err) {
      if (err instanceof Error) {
        message.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  const sessionColumns: TableProps<LeadHuntingSessionSummary>['columns'] = [
    {
      title: 'Search',
      key: 'search',
      render: (_value, row) => (
        <Flex vertical gap={4}>
          <Text strong>{row.searchQuery ?? 'Untitled session'}</Text>
          <Space wrap size={[8, 8]}>
            <Tag>{row.captureMode}</Tag>
            <Tag color="blue">{row.status}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(row.createdAt).toLocaleString()}
            </Text>
          </Space>
        </Flex>
      ),
    },
    {
      title: 'Captured',
      dataIndex: 'totalPostsCaptured',
      key: 'totalPostsCaptured',
      width: 100,
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: 'Qualified',
      dataIndex: 'totalQualified',
      key: 'totalQualified',
      width: 100,
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: 'Review',
      dataIndex: 'totalNeedsReview',
      key: 'totalNeedsReview',
      width: 100,
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_value, row) => (
        <Button onClick={() => navigate(`/lead-hunting/sessions/${row.id}`)}>
          Open
        </Button>
      ),
    },
  ];

  if (!ctx) {
    return (
      <Result
        status="info"
        title="Sign in to review lead-hunting activity"
        subTitle="Lead hunting is scoped to an authenticated workspace member."
      />
    );
  }

  if (!canRead) {
    return (
      <Result
        status="403"
        title="Lead-hunting access is not enabled for your role"
        subTitle="Ask a company admin to grant the lead-hunting permissions for this workspace."
      />
    );
  }

  const monthlyBudgetRemaining = overview?.usage.remaining.monthlyProviderBudgetUsd ?? null;
  const researchLimitRemaining = overview?.usage.remaining.monthlyResearchLimit ?? null;

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="M16"
        title="Lead Hunting"
        subtitle="Monitor captured sessions, triage researched posts, and keep provider usage inside the workspace limits."
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" onClick={() => navigate('/lead-hunting/review')}>
              Review Queue
            </Button>
          </>
        }
      />

      {error ? (
        <Alert
          type="error"
          showIcon
          message="Lead-hunting overview failed to load"
          description={error}
          action={
            <Button size="small" onClick={() => void load()}>
              Retry
            </Button>
          }
        />
      ) : null}

      {overview?.usage.limits.monthlyResearchLimit != null && researchLimitRemaining != null ? (
        <Alert
          type={remainingTone(researchLimitRemaining) === 'error' ? 'error' : 'warning'}
          showIcon
          message="Research limit tracking is active"
          description={`${researchLimitRemaining.toLocaleString()} research runs remain this month.`}
        />
      ) : null}

      {overview?.usage.limits.monthlyProviderBudgetUsd != null && monthlyBudgetRemaining != null ? (
        <Alert
          type={remainingTone(monthlyBudgetRemaining) === 'error' ? 'error' : 'warning'}
          showIcon
          message="Provider budget tracking is active"
          description={`${formatCurrency(monthlyBudgetRemaining)} remains in the current external-provider budget.`}
        />
      ) : null}

      <Flex gap={16} wrap>
        <MetricCard
          eyebrow="Needs review"
          value={overview?.queues.needsReview.toLocaleString() ?? '—'}
          loading={loading}
          caption="Posts waiting for operator review"
        />
        <MetricCard
          eyebrow="Qualified"
          value={overview?.queues.qualified.toLocaleString() ?? '—'}
          loading={loading}
          caption="Qualified posts ready for CRM handoff"
        />
        <MetricCard
          eyebrow="Researching"
          value={overview?.queues.researching.toLocaleString() ?? '—'}
          loading={loading}
          caption="Currently in the enrichment pipeline"
        />
        <MetricCard
          eyebrow="Provider cost (month)"
          value={overview ? formatCurrency(overview.usage.month.providerCostUsd) : '—'}
          loading={loading}
          caption={`${overview?.usage.month.providerCalls.toLocaleString() ?? '0'} provider calls`}
        />
      </Flex>

      <PageSection
        title="Usage and limits"
        subtitle="Company and user summaries for lead-hunting throughput and external-provider spend."
      >
        {overview ? (
          <Flex vertical gap={20}>
            <Space wrap size={[8, 8]}>
              <Tag color={remainingTone(overview.usage.remaining.dailyResearchLimit)}>
                Daily remaining: {overview.usage.remaining.dailyResearchLimit ?? 'Unlimited'}
              </Tag>
              <Tag color={remainingTone(overview.usage.remaining.monthlyResearchLimit)}>
                Monthly remaining: {overview.usage.remaining.monthlyResearchLimit ?? 'Unlimited'}
              </Tag>
              <Tag color={remainingTone(overview.usage.remaining.monthlyProviderBudgetUsd)}>
                Provider budget remaining:{' '}
                {overview.usage.remaining.monthlyProviderBudgetUsd == null
                  ? 'Unlimited'
                  : formatCurrency(overview.usage.remaining.monthlyProviderBudgetUsd)}
              </Tag>
            </Space>

            <Table
              rowKey="provider"
              dataSource={overview.usage.byProvider}
              pagination={false}
              size="small"
              columns={[
                { title: 'Provider', dataIndex: 'provider', key: 'provider' },
                {
                  title: 'Requests',
                  dataIndex: 'requests',
                  key: 'requests',
                  render: (value: number) => value.toLocaleString(),
                },
                {
                  title: 'Estimated cost',
                  dataIndex: 'estimatedCostUsd',
                  key: 'estimatedCostUsd',
                  render: (value: number) => formatCurrency(value),
                },
                {
                  title: 'Last used',
                  dataIndex: 'lastUsedAt',
                  key: 'lastUsedAt',
                  render: (value: string | null) => (value ? new Date(value).toLocaleString() : '—'),
                },
              ]}
              locale={{
                emptyText: <EmptyState description="Provider usage details are hidden until your role includes external provider usage visibility." />,
              }}
            />

            <Table
              rowKey={(row) => row.userId ?? row.label}
              dataSource={overview.usage.byUser}
              pagination={false}
              size="small"
              columns={[
                { title: 'User', dataIndex: 'label', key: 'label' },
                {
                  title: 'Captured',
                  dataIndex: 'capturedPosts',
                  key: 'capturedPosts',
                  render: (value: number) => value.toLocaleString(),
                },
                {
                  title: 'Research runs',
                  dataIndex: 'researchRuns',
                  key: 'researchRuns',
                  render: (value: number) => value.toLocaleString(),
                },
                {
                  title: 'Qualified',
                  dataIndex: 'qualifiedPosts',
                  key: 'qualifiedPosts',
                  render: (value: number) => value.toLocaleString(),
                },
                {
                  title: 'Provider cost',
                  dataIndex: 'providerCostUsd',
                  key: 'providerCostUsd',
                  render: (value: number) => formatCurrency(value),
                },
              ]}
              locale={{
                emptyText: <EmptyState description="No user-level lead-hunting activity has been recorded this month." />,
              }}
            />
          </Flex>
        ) : null}
      </PageSection>

      <PageSection
        title="Recent sessions"
        subtitle="Visible-post capture sessions and the research outcomes they produced."
        extra={
          <Button onClick={() => navigate('/lead-hunting/review')}>
            Open Review Queue
          </Button>
        }
        bodyStyle={{ padding: 0 }}
      >
        <Table
          rowKey="id"
          columns={sessionColumns}
          dataSource={overview?.recentSessions ?? []}
          loading={loading && !overview}
          pagination={false}
          locale={{
            emptyText: (
              <EmptyState
                description="No lead-hunting sessions have been captured yet. Use the extension to capture visible LinkedIn posts first."
              />
            ),
          }}
        />
      </PageSection>

      <PageSection
        title="Recent posts"
        subtitle="Newest captured posts with their latest classification and missing-field cues."
      >
        <LeadHuntingPostsTable
          items={overview?.recentPosts ?? []}
          loading={loading}
          onOpen={(item) => navigate(`/lead-hunting/posts/${item.id}`)}
          emptyDescription="No researched posts are available yet."
        />
      </PageSection>

      {canManage ? (
        <PageSection
          eyebrow="Governance"
          title="Workspace settings"
          subtitle="Set the review guardrails and the spend limits that control lead-hunting research."
          extra={
            <Button
              type="primary"
              icon={<SettingOutlined />}
              onClick={() => void saveSettings()}
              loading={saving}
            >
              Save settings
            </Button>
          }
        >
          <Form form={form} layout="vertical">
            <Space size={[16, 16]} wrap style={{ width: '100%' }}>
              <Form.Item name="requireEvidenceForApproval" label="Require evidence for approval" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="warnIfMissingWebsite" label="Warn when website is missing" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="warnIfMissingWorkEmail" label="Warn when work email is missing" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Space>

            <Space size={[16, 16]} wrap style={{ width: '100%' }}>
              <Form.Item name="dailyResearchLimit" label="Daily research limit">
                <InputNumber min={1} placeholder="Unlimited" style={{ width: 180 }} />
              </Form.Item>
              <Form.Item name="monthlyResearchLimit" label="Monthly research limit">
                <InputNumber min={1} placeholder="Unlimited" style={{ width: 180 }} />
              </Form.Item>
              <Form.Item name="monthlyProviderBudgetUsd" label="Monthly provider budget (USD)">
                <InputNumber min={0} placeholder="Unlimited" style={{ width: 220 }} />
              </Form.Item>
              <Form.Item name="rerunCooldownMinutes" label="Rerun cooldown (minutes)">
                <InputNumber min={0} style={{ width: 180 }} />
              </Form.Item>
            </Space>

            <Text type="secondary">
              These settings are enforced server-side for queued research and manual approval actions.
            </Text>
          </Form>
        </PageSection>
      ) : null}

      {overview?.recentSessions[0]?.searchUrl ? (
        <PageSection title="Operator shortcut" subtitle="Open the newest captured LinkedIn search in a browser tab.">
          <Link href={overview.recentSessions[0].searchUrl} target="_blank">
            <Space>
              Open latest search URL
              <LinkOutlined />
            </Space>
          </Link>
        </PageSection>
      ) : null}
    </Flex>
  );
}
