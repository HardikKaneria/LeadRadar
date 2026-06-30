
import { useEffect, useMemo, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  DatePicker,
  Flex,
  Result,
  Table,
  Typography,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type {
  UsageCompanyReport,
  UsageCompanySummaryReport,
  UsageEventSummary,
  UsageEventsReport,
  UsageLimitSummary,
  UsageMeReport,
  UsageModelBreakdown,
  UsageProviderBreakdown,
  UsageTaskBreakdown,
  UsageUserBreakdown,
  UsageTaskType,
} from '@radar/contracts';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { PageSection } from '@/components/ui/page-section';

const { Text } = Typography;

type VisibleUsageReport = UsageCompanyReport | UsageCompanySummaryReport | UsageMeReport;

interface LimitRow {
  key: string;
  label: string;
  used: number;
  remaining: number | null;
  effectiveLimit: number | null;
  credit: number;
  exceeded: boolean;
}

function toLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function sortBreakdownsByRequests<T extends { requests: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.requests - a.requests);
}

function providerRowsFromReport(report: VisibleUsageReport | null): UsageProviderBreakdown[] {
  if (!report) return [];
  if ('byProvider' in report) return sortBreakdownsByRequests(report.byProvider);
  if ('byModel' in report) {
    const byProvider = new Map<string, UsageProviderBreakdown>();
    for (const row of report.byModel) {
      const current = byProvider.get(row.provider) ?? { provider: row.provider, requests: 0, tokens: 0, cost: 0 };
      current.requests += row.requests;
      current.tokens += row.tokens;
      current.cost += row.cost;
      byProvider.set(row.provider, current);
    }
    return sortBreakdownsByRequests([...byProvider.values()]);
  }
  return [];
}

function limitRowsFromSummary(summary: UsageLimitSummary | null): LimitRow[] {
  if (!summary) return [];

  return [
    { key: 'requests', label: 'Requests', ...summary.requests },
    { key: 'tokens', label: 'Tokens', ...summary.tokens },
    { key: 'cost', label: 'Cost', ...summary.cost },
    { key: 'opportunityAnalysis', label: 'Opportunity analysis', ...summary.opportunityAnalysis },
    { key: 'proposalGeneration', label: 'Proposal generation', ...summary.proposalGeneration },
    { key: 'companyResearch', label: 'Company research', ...summary.companyResearch },
    { key: 'embedding', label: 'Embeddings', ...summary.embedding },
  ];
}

function progressPercent(row: LimitRow): number {
  if (row.effectiveLimit == null || row.effectiveLimit <= 0) return 0;
  return Math.min(100, Math.round((row.used / row.effectiveLimit) * 100));
}

function usageScopeLabel(options: {
  canReadCompanyUsage: boolean;
  canReadCompanySummary: boolean;
  canReadOwnUsage: boolean;
}): string {
  if (options.canReadCompanyUsage) return 'Detailed company usage';
  if (options.canReadCompanySummary) return 'Company summary';
  if (options.canReadOwnUsage) return 'Your AI usage';
  return 'No usage access';
}

export default function AiSettingsPage() {
  const { currentOrg, accessToken, can } = useAuth();
  const { message } = App.useApp();
  const organizationId = currentOrg?.organizationId ?? null;

  const canReadOwnUsage = can('usage.read_own');
  const canReadCompanySummary = can('usage.read_company_summary');
  const canReadCompanyUsage = can('usage.read_company');
  const canReadUsageLimits = can('company.usage.read');
  const canViewUsage = canReadOwnUsage || canReadCompanySummary || canReadCompanyUsage || canReadUsageLimits;

  const ctx = useMemo(
    () =>
      accessToken && organizationId
        ? {
            accessToken,
            organizationId,
          }
        : null,
    [accessToken, organizationId],
  );

  const [period, setPeriod] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [reloadToken, setReloadToken] = useState(0);

  const [meReport, setMeReport] = useState<UsageMeReport | null>(null);
  const [companyReport, setCompanyReport] = useState<UsageCompanyReport | null>(null);
  const [companySummaryReport, setCompanySummaryReport] = useState<UsageCompanySummaryReport | null>(null);
  const [limitsReport, setLimitsReport] = useState<{ limits: UsageLimitSummary } | null>(null);
  const [eventsReport, setEventsReport] = useState<UsageEventsReport | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  const periodKey = period.format('YYYY-MM');

  useEffect(() => {
    if (!ctx || !canViewUsage) {
      setMeReport(null);
      setCompanyReport(null);
      setCompanySummaryReport(null);
      setLimitsReport(null);
      setEventsReport(null);
      setUsageError(null);
      setUsageLoading(false);
      return;
    }

    let cancelled = false;
    setUsageLoading(true);
    setUsageError(null);

    const detailRequest: Promise<VisibleUsageReport> = canReadCompanyUsage
      ? api.usageCompany(ctx, periodKey)
      : canReadCompanySummary
        ? api.usageCompanySummary(ctx, periodKey)
        : api.usageMe(ctx, periodKey);

    const limitsRequest = canReadUsageLimits ? api.usageLimits(ctx, periodKey) : Promise.resolve(null);
    const eventsRequest = canReadCompanyUsage
      ? api.usageEvents(ctx, { period: periodKey, page: 1, pageSize: 10 })
      : Promise.resolve(null);

    void Promise.all([detailRequest, limitsRequest, eventsRequest])
      .then(([detail, limits, events]) => {
        if (cancelled) return;

        setMeReport(canReadCompanyUsage || canReadCompanySummary ? null : (detail as UsageMeReport));
        setCompanyReport(canReadCompanyUsage ? (detail as UsageCompanyReport) : null);
        setCompanySummaryReport(canReadCompanySummary && !canReadCompanyUsage ? (detail as UsageCompanySummaryReport) : null);
        setLimitsReport(limits ? { limits: limits.limits } : null);
        setEventsReport(events);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMeReport(null);
        setCompanyReport(null);
        setCompanySummaryReport(null);
        setLimitsReport(null);
        setEventsReport(null);
        setUsageError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    ctx,
    canViewUsage,
    canReadCompanyUsage,
    canReadCompanySummary,
    canReadUsageLimits,
    periodKey,
    reloadToken,
  ]);

  const visibleUsageReport = (companyReport ?? companySummaryReport ?? meReport) as VisibleUsageReport | null;

  const providerBreakdown = useMemo(
    () => providerRowsFromReport(visibleUsageReport),
    [visibleUsageReport],
  );

  const modelBreakdown = useMemo<UsageModelBreakdown[]>(
    () =>
      sortBreakdownsByRequests(
        companyReport?.byModel ?? companySummaryReport?.byModel ?? [],
      ),
    [companyReport, companySummaryReport],
  );

  const taskBreakdown = useMemo<UsageTaskBreakdown[]>(
    () => sortBreakdownsByRequests(visibleUsageReport?.byTask ?? []),
    [visibleUsageReport],
  );

  const userBreakdown = useMemo<UsageUserBreakdown[]>(
    () => sortBreakdownsByRequests(companyReport?.byUser ?? []),
    [companyReport],
  );

  const limitSummary = limitsReport?.limits ?? visibleUsageReport?.limits ?? null;
  const limitRows = useMemo(() => limitRowsFromSummary(limitSummary), [limitSummary]);
  const usageScope = usageScopeLabel({ canReadCompanyUsage, canReadCompanySummary, canReadOwnUsage });

  if (!ctx) {
    return (
      <Result
        status="info"
        title="Sign in to manage AI settings"
        subTitle="Usage reporting is tied to an authenticated workspace member."
      />
    );
  }

  if (!canViewUsage) {
    return (
      <Result
        status="403"
        title="No AI settings access"
        subTitle="Your current role does not include AI usage visibility."
      />
    );
  }

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Settings"
        title="AI Usage & Cost"
        subtitle="Review how AI traffic and spend are flowing for your workspace."
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReloadToken((value) => value + 1)}
            loading={usageLoading}
          >
            Refresh
          </Button>
        }
      />

      <Flex gap={16} wrap>
        <MetricCard
          eyebrow="Requests this month"
          value={visibleUsageReport ? visibleUsageReport.totals.requests.toLocaleString() : '—'}
          loading={usageLoading}
          caption={usageScope}
        />
        <MetricCard
          eyebrow="AI cost this month"
          value={visibleUsageReport ? formatCurrency(visibleUsageReport.totals.cost) : '—'}
          loading={usageLoading}
          caption={
            visibleUsageReport
              ? `${visibleUsageReport.totals.tokens.toLocaleString()} tokens`
              : 'No usage report loaded'
          }
        />
        <MetricCard
          eyebrow="Most used provider"
          value={providerBreakdown[0] ? toLabel(providerBreakdown[0].provider) : '—'}
          loading={usageLoading}
          caption={
            providerBreakdown[0]
              ? `${providerBreakdown[0].requests.toLocaleString()} requests`
              : 'No traffic yet'
          }
        />
      </Flex>

      <PageSection
        title="Usage Ledger"
        subtitle="Detailed breakdown of your workspace's AI traffic."
        extra={
          <DatePicker
            picker="month"
            value={period}
            onChange={(date) => {
              if (date) setPeriod(date);
            }}
            allowClear={false}
          />
        }
      >
        <Card size="small" variant="borderless" styles={{ body: { padding: 0 } }}>
          <Table
            size="small"
            dataSource={taskBreakdown}
            rowKey={(record: UsageTaskBreakdown) => record.taskType}
            pagination={false}
            columns={[
              {
                title: 'Task Type',
                dataIndex: 'taskType',
                key: 'taskType',
                render: (val: string) => <strong>{toLabel(val)}</strong>,
              },
              {
                title: 'Requests',
                dataIndex: 'requests',
                key: 'requests',
                render: (val: number) => val.toLocaleString(),
              },
              {
                title: 'Tokens',
                dataIndex: 'tokens',
                key: 'tokens',
                render: (val: number) => val.toLocaleString(),
              },
              {
                title: 'Cost',
                dataIndex: 'cost',
                key: 'cost',
                render: (val: number) => formatCurrency(val),
              },
            ]}
          />
        </Card>
      </PageSection>
      
      {companyReport && (
        <PageSection title="User Breakdown" subtitle="AI traffic by team member.">
          <Card size="small" variant="borderless" styles={{ body: { padding: 0 } }}>
            <Table
              size="small"
              dataSource={userBreakdown}
              rowKey={(record: UsageUserBreakdown) => record.userId ?? 'unknown'}
              pagination={false}
              columns={[
                {
                  title: 'User',
                  dataIndex: 'userId',
                  key: 'userId',
                  render: (val: string) => <strong>{val}</strong>, // Usually we'd map to name, but for now ID
                },
                {
                  title: 'Requests',
                  dataIndex: 'requests',
                  key: 'requests',
                  render: (val: number) => val.toLocaleString(),
                },
                {
                  title: 'Cost',
                  dataIndex: 'cost',
                  key: 'cost',
                  render: (val: number) => formatCurrency(val),
                },
              ]}
            />
          </Card>
        </PageSection>
      )}
    </Flex>
  );
}
