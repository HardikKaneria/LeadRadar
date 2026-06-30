
import { useEffect, useMemo, useState } from 'react';
import {
  CheckOutlined,
  EyeOutlined,
  ReloadOutlined,
  RobotOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  DatePicker,
  Descriptions,
  Divider,
  Empty,
  Flex,
  Input,
  List,
  Pagination,
  Progress,
  Result,
  Segmented,
  Skeleton,
  Space,
  Tag,
  Typography,
  theme,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type {
  DiscoveryFilter,
  DiscoveryInboxStatus,
  DiscoverySort,
  DiscoverySource,
  DiscoveryStatus,
} from '@radar/contracts';
import { api, type Job } from '@/lib/api';
import {
  type DiscoveryAnalysisJob,
  type DiscoveryDetailWithAi,
  type DiscoveryServiceMatch,
  type DiscoverySummaryWithAi,
  getDiscovery,
  listDiscoveries,
  setDiscoveryStatus,
} from '@/lib/discoveries';
import { convertDiscovery } from '@/lib/opportunities';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import {
  DiscoveryStatusTag,
  PriorityTag,
  ScoreTag,
  SourceTag,
  UrgencyTag,
} from '@/components/ui/status-tag';

const { Text, Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const PAGE_SIZE = 20;
const TERMINAL_JOB_STATUSES = new Set<DiscoveryAnalysisJob['status']>(['completed', 'failed', 'cancelled']);

type StatusAction = 'reviewed' | 'approved' | 'ignored';

function toLabel(value: string): string {
  return value
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function formatDateTime(value: string): string {
  return dayjs(value).format('MMM D, YYYY · h:mm A');
}

function formatBudget(value: number | null): string {
  return value == null ? 'Unknown' : value.toLocaleString();
}

function formatServiceMatchSummary(matches: DiscoveryServiceMatch[]): string | null {
  if (matches.length === 0) return null;

  return matches
    .slice(0, 2)
    .map((match) => `${match.service}${match.isPriority ? ' (priority)' : ''}`)
    .join(', ');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    // Supabase PostgREST errors: { message, details, hint, code }
    const msg = e.message ?? e.details ?? e.hint;
    if (typeof msg === 'string' && msg) return msg;
  }
  return 'Something went wrong. Please try again.';
}

function toTrackedJob(job: Job): DiscoveryAnalysisJob {
  return {
    id: job.id,
    jobName: job.job_name,
    status: job.status as DiscoveryAnalysisJob['status'],
    progress: job.progress,
    error: typeof job.error === 'string' ? job.error : null,
    createdAt: typeof job.created_at === 'string' ? job.created_at : new Date().toISOString(),
    finishedAt: typeof job.finished_at === 'string' ? job.finished_at : null,
  };
}

function pendingAnalysisJob(jobId: string): DiscoveryAnalysisJob {
  return {
    id: jobId,
    jobName: 'analyze-discovery',
    status: 'queued',
    progress: 0,
    error: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
  };
}

interface FilterDraft {
  status: DiscoveryStatus[];
  source: DiscoverySource[];
  country: string;
  search: string;
  range: [Dayjs, Dayjs] | null;
  sort: DiscoverySort;
}

function emptyDraft(): FilterDraft {
  return { status: [], source: [], country: '', search: '', range: null, sort: 'newest' };
}

function buildFilter(draft: FilterDraft, page: number): DiscoveryFilter {
  const filter: DiscoveryFilter = { page, pageSize: PAGE_SIZE, sort: draft.sort };
  if (draft.status.length) filter.status = draft.status;
  if (draft.source.length) filter.source = draft.source;
  const country = draft.country.trim();
  if (country) filter.country = country;
  const search = draft.search.trim();
  if (search) filter.search = search;
  if (draft.range) {
    filter.dateFrom = draft.range[0].startOf('day').toISOString();
    filter.dateTo = draft.range[1].endOf('day').toISOString();
  }
  return filter;
}

function isTerminalJob(job: DiscoveryAnalysisJob | null): boolean {
  return !!job && TERMINAL_JOB_STATUSES.has(job.status);
}

function jobTone(job: DiscoveryAnalysisJob) {
  if (job.status === 'failed' || job.status === 'cancelled') return 'exception' as const;
  if (job.status === 'completed') return 'success' as const;
  return 'active' as const;
}

function AnalysisJobCard({ job }: { job: DiscoveryAnalysisJob }) {
  const done = isTerminalJob(job);
  const failed = job.status === 'failed' || job.status === 'cancelled';
  const percent = Math.min(100, Math.max(0, job.progress));

  return (
    <Card size="small" title={done ? (failed ? 'Latest analysis attempt failed' : 'Analysis complete') : 'AI analysis running'}>
      <Flex vertical gap={12}>
        <Progress percent={percent} status={jobTone(job)} />
        <Space wrap size={[8, 8]}>
          <Tag variant="filled" style={{ textTransform: 'capitalize' }}>
            {toLabel(job.status)}
          </Tag>
          <Text type="secondary" className="font-mono" style={{ fontSize: 12 }}>
            job {job.id.slice(0, 8)}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Started {formatDateTime(job.createdAt)}
          </Text>
        </Space>
        {job.error && <Alert type="error" showIcon title={job.error} />}
        {!done && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            The inbox refreshes automatically when the analysis finishes.
          </Text>
        )}
      </Flex>
    </Card>
  );
}

export default function DiscoveryInboxPage() {
  const { currentOrg, accessToken, can } = useAuth();
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();

  const organizationId = currentOrg?.organizationId ?? null;
  const canRead = can('discoveries.read');
  const canWrite = can('discoveries.write');
  const canApprove = canWrite && can('discoveries.approve');
  const canUseAi = can('ai.use');

  const [draft, setDraft] = useState<FilterDraft>(emptyDraft);
  const [filters, setFilters] = useState<DiscoveryFilter>(() => buildFilter(emptyDraft(), 1));
  const [items, setItems] = useState<DiscoverySummaryWithAi[]>([]);
  const [total, setTotal] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DiscoveryDetailWithAi | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<StatusAction | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisJobs, setAnalysisJobs] = useState<Record<string, DiscoveryAnalysisJob>>({});
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!organizationId || !canRead) {
      setItems([]);
      setTotal(0);
      setActiveId(null);
      setDetail(null);
      setSelectedIds([]);
      setAnalysisJobs({});
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    void listDiscoveries(organizationId, filters)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setSelectedIds([]);
        setActiveId((current) =>
          current && result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? null,
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setItems([]);
        setTotal(0);
        setActiveId(null);
        setDetail(null);
        setListError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, canRead, filters, reloadToken]);

  useEffect(() => {
    if (!organizationId || !canRead || !activeId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void getDiscovery(organizationId, activeId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, canRead, activeId, reloadToken]);

  useEffect(() => {
    if (!organizationId || !accessToken) return;

    const activeEntries = Object.entries(analysisJobs).filter(([, job]) => !TERMINAL_JOB_STATUSES.has(job.status));
    if (activeEntries.length === 0) return;

    let cancelled = false;
    const ctx = { accessToken, organizationId };

    const timer = setTimeout(async () => {
      const nextStates = await Promise.all(
        activeEntries.map(async ([discoveryId, job]) => {
          try {
            const next = await api.job(ctx, job.id);
            return { discoveryId, job: toTrackedJob(next) };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      let shouldReload = false;
      setAnalysisJobs((current) => {
        const next = { ...current };
        for (const result of nextStates) {
          if (!result || !next[result.discoveryId] || next[result.discoveryId].id !== result.job.id) continue;
          if (result.job.status === 'completed') {
            delete next[result.discoveryId];
            shouldReload = true;
            continue;
          }
          next[result.discoveryId] = result.job;
        }
        return next;
      });

      if (shouldReload) {
        setReloadToken((value) => value + 1);
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessToken, analysisJobs, organizationId]);

  const currentPage = filters.page;
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  async function doApprove(ids: string[]) {
    if (!organizationId || ids.length === 0) return;
    setBusyAction('approved');
    try {
      await Promise.all(ids.map(id => convertDiscovery({ discoveryId: id, force: true })));
      message.success(`${ids.length} discover${ids.length === 1 ? 'y' : 'ies'} approved and converted to opportunit${ids.length === 1 ? 'y' : 'ies'}`);
      setSelectedIds([]);
      setReloadToken((value) => value + 1);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function runStatusAction(ids: string[], status: StatusAction) {
    if (!organizationId || ids.length === 0) return;
    if (status === 'approved') {
      // Check if any selected items are flagged as bad leads — warn before converting
      const badLeads = ids.filter(id => {
        const item = items.find(i => i.id === id);
        return item?.analysis?.isBadLead;
      });
      const singleBadLead = ids.length === 1 && detail?.analysis?.isBadLead;
      if (badLeads.length > 0 || singleBadLead) {
        modal.confirm({
          title: 'Override bad-lead flag?',
          content: `${badLeads.length || 1} of the selected discover${badLeads.length === 1 ? 'y is' : 'ies are'} flagged as bad leads by AI. Approving will force-convert ${badLeads.length === 1 ? 'it' : 'them'} into opportunities anyway. Continue?`,
          okText: 'Approve anyway',
          okType: 'danger',
          onOk: () => doApprove(ids),
        });
        return;
      }
      return doApprove(ids);
    }
    setBusyAction(status);
    try {
      await setDiscoveryStatus(organizationId, ids, status as DiscoveryInboxStatus);
      message.success(`${ids.length} discover${ids.length === 1 ? 'y' : 'ies'} marked ${status}`);
      setSelectedIds([]);
      setReloadToken((value) => value + 1);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function analyzeDiscovery(id: string) {
    if (!organizationId || !accessToken) return;

    setAnalyzingId(id);
    try {
      const accepted = await api.analyzeDiscovery({ accessToken, organizationId }, id);
      setAnalysisJobs((current) => ({ ...current, [id]: pendingAnalysisJob(accepted.jobId) }));
      message.success('AI analysis queued');
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setAnalyzingId(null);
    }
  }

  function applyFilters() {
    setFilters(buildFilter(draft, 1));
  }

  function resetFilters() {
    const next = emptyDraft();
    setDraft(next);
    setFilters(buildFilter(next, 1));
    setSelectedIds([]);
  }

  function setPage(page: number) {
    setFilters((current) => ({ ...current, page }));
    setSelectedIds([]);
  }

  const actionButtons = useMemo(
    () =>
      (ids: string[], size: 'small' | 'middle') => (
        <Space wrap>
          <Button
            size={size}
            icon={<EyeOutlined />}
            loading={busyAction === 'reviewed'}
            disabled={!ids.length}
            onClick={() => void runStatusAction(ids, 'reviewed')}
          >
            Reviewed
          </Button>
          <Button
            size={size}
            icon={<StopOutlined />}
            loading={busyAction === 'ignored'}
            disabled={!ids.length}
            onClick={() => void runStatusAction(ids, 'ignored')}
          >
            Ignore
          </Button>
          {canApprove ? (
            <Button
              size={size}
              type="primary"
              icon={<CheckOutlined />}
              loading={busyAction === 'approved'}
              disabled={!ids.length}
              onClick={() => void runStatusAction(ids, 'approved')}
            >
              Approve
            </Button>
          ) : null}
        </Space>
      ),
    [busyAction, canApprove],
  );

  if (!currentOrg) {
    return (
      <Result
        status="info"
        title="No workspace yet"
        subTitle="Join or create a workspace before reviewing discoveries."
      />
    );
  }

  if (!canRead) {
    return <Result status="403" title="No access" subTitle="Your current role does not include discoveries.read." />;
  }

  const displayedJob = detail ? analysisJobs[detail.id] ?? detail.analysisJob : null;
  const showJobCard = displayedJob && (displayedJob.status !== 'completed' || !detail?.analysis);
  const analysisJobActive = displayedJob ? !TERMINAL_JOB_STATUSES.has(displayedJob.status) : false;

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Triage"
        title="Discovery Inbox"
        subtitle="Review raw opportunities, see the AI signal, and promote only the leads worth acting on."
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => setReloadToken((value) => value + 1)} loading={listLoading}>
            Refresh
          </Button>
        }
      />

      <Row3>
        <Card
          title="Filters"
          size="small"
          extra={
            <Button type="link" size="small" onClick={resetFilters}>
              Reset
            </Button>
          }
        >
          <Flex vertical gap={16}>
            <Field label="Search title">
              <Input
                allowClear
                placeholder="Landing page redesign"
                value={draft.search}
                onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
                onPressEnter={applyFilters}
              />
            </Field>
            <Field label="Country">
              <Input
                allowClear
                placeholder="United States"
                value={draft.country}
                onChange={(event) => setDraft((current) => ({ ...current, country: event.target.value }))}
                onPressEnter={applyFilters}
              />
            </Field>
            <Field label="Captured between">
              <RangePicker
                style={{ width: '100%' }}
                value={draft.range}
                onChange={(range) => setDraft((current) => ({ ...current, range: range as [Dayjs, Dayjs] | null }))}
              />
            </Field>
            <Field label="Sort">
              <Segmented
                block
                value={draft.sort}
                onChange={(value) => setDraft((current) => ({ ...current, sort: value as DiscoverySort }))}
                options={[
                  { label: 'Newest', value: 'newest' },
                  { label: 'Oldest', value: 'oldest' },
                ]}
              />
            </Field>
            <Field label="Status">
              <Checkbox.Group
                value={draft.status}
                onChange={(value) => setDraft((current) => ({ ...current, status: value as DiscoveryStatus[] }))}
                options={[
                  { label: 'New', value: 'new' },
                  { label: 'Processing', value: 'processing' },
                  { label: 'Analyzed', value: 'analyzed' },
                  { label: 'Reviewed', value: 'reviewed' },
                  { label: 'Approved', value: 'approved' },
                  { label: 'Ignored', value: 'ignored' },
                  { label: 'Converted', value: 'converted' },
                ]}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              />
            </Field>
            <Field label="Source">
              <Checkbox.Group
                value={draft.source}
                onChange={(value) => setDraft((current) => ({ ...current, source: value as DiscoverySource[] }))}
                options={[
                  { label: 'Linkedin', value: 'linkedin' },
                  { label: 'Upwork', value: 'upwork' },
                  { label: 'Freelancer', value: 'freelancer' },
                  { label: 'Website', value: 'website' },
                  { label: 'Referral', value: 'referral' },
                  { label: 'Manual', value: 'manual' },
                  { label: 'Csv', value: 'csv' },
                  { label: 'Whatsapp', value: 'whatsapp' },
                  { label: 'Email', value: 'email' },
                  { label: 'Existing Customer', value: 'existing_customer' },
                  { label: 'Conference', value: 'conference' },
                  { label: 'Client Call', value: 'client_call' },
                  { label: 'Partnership', value: 'partnership' },
                  { label: 'Other', value: 'other' },
                ]}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              />
            </Field>
            <Button type="primary" block onClick={applyFilters}>
              Apply filters
            </Button>
          </Flex>
        </Card>

        <Card
          title={
            <Flex align="center" gap={8}>
              Inbox
              <Badge count={total} overflowCount={9999} color={token.colorPrimary} />
            </Flex>
          }
          size="small"
          extra={
            canWrite && items.length > 0 ? (
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(event) => setSelectedIds(event.target.checked ? items.map((item) => item.id) : [])}
              >
                Select page
              </Checkbox>
            ) : null
          }
        >
          {canWrite && selectedIds.length > 0 ? (
            <Alert
              type="info"
              style={{ marginBottom: 12 }}
              title={
                <Flex align="center" justify="space-between" gap={12} wrap>
                  <Text>{selectedIds.length} selected</Text>
                  {actionButtons(selectedIds, 'small')}
                </Flex>
              }
            />
          ) : null}

          {listError ? (
            <Alert type="error" showIcon title={listError} />
          ) : listLoading && items.length === 0 ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : items.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No discoveries match this view. Capture some, or adjust your filters."
            />
          ) : (
            <>
              <List
                dataSource={items}
                renderItem={(item) => {
                  const active = item.id === activeId;
                  const job = analysisJobs[item.id] ?? item.analysisJob;
                  const matchSummary = formatServiceMatchSummary(item.analysis?.serviceMatches ?? []);
                  const analysisRunning = job && !TERMINAL_JOB_STATUSES.has(job.status);

                  return (
                    <div
                      onClick={() => setActiveId(item.id)}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: 12,
                        marginBottom: 8,
                        borderRadius: token.borderRadiusLG,
                        cursor: 'pointer',
                        border: `1px solid ${active ? token.colorPrimary : token.colorBorderSecondary}`,
                        background: active ? token.colorPrimaryBg : 'transparent',
                      }}
                    >
                      {canWrite ? (
                        <Checkbox
                          checked={selectedIds.includes(item.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            setSelectedIds((current) =>
                              event.target.checked
                                ? [...current, item.id]
                                : current.filter((selectedId) => selectedId !== item.id),
                            )
                          }
                        />
                      ) : null}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Space size={[6, 6]} wrap>
                          <SourceTag source={item.source} />
                          <DiscoveryStatusTag status={item.status} />
                          {item.analysis ? <ScoreTag score={item.analysis.score} isBadLead={item.analysis.isBadLead} /> : null}
                          {item.actionPlan ? <PriorityTag priority={item.actionPlan.priority} /> : null}
                        </Space>

                        <div style={{ marginTop: 8 }}>
                          <Text strong ellipsis style={{ display: 'block' }}>
                            {item.title ?? 'Untitled discovery'}
                          </Text>
                          <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13 }}>
                            {item.companyName ?? 'Unknown company'}
                          </Text>
                          <Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13, marginTop: 8 }}>
                            {item.actionPlan?.recommendedAction ??
                              item.analysis?.reason ??
                              (analysisRunning ? 'AI analysis running…' : 'Awaiting AI analysis')}
                          </Text>
                        </div>

                        <Flex gap={8} wrap style={{ marginTop: 8 }}>
                          {item.analysis ? <UrgencyTag urgency={item.analysis.urgency} /> : null}
                          {item.country ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {item.country}
                            </Text>
                          ) : null}
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Budget {formatBudget(item.budgetHint)}
                          </Text>
                          {item.actionPlan ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Due {formatDateTime(item.actionPlan.dueAt)}
                            </Text>
                          ) : null}
                          {matchSummary ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Match {matchSummary}
                            </Text>
                          ) : null}
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatDateTime(item.createdAt)}
                          </Text>
                        </Flex>

                        {analysisRunning ? (
                          <Progress
                            percent={Math.min(100, Math.max(0, job.progress))}
                            status={jobTone(job)}
                            size="small"
                            showInfo={false}
                            style={{ marginTop: 10 }}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                }}
              />

              <Flex justify="center" style={{ marginTop: 12 }}>
                <Pagination
                  current={currentPage}
                  total={total}
                  pageSize={PAGE_SIZE}
                  showSizeChanger={false}
                  onChange={setPage}
                  disabled={listLoading}
                />
              </Flex>
            </>
          )}
        </Card>

        <Card title="Preview" size="small">
          {detailError ? (
            <Alert type="error" showIcon title={detailError} />
          ) : detailLoading && !detail ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : !detail ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Choose a discovery to inspect it here." />
          ) : (
            <Flex vertical gap={16}>
              <div>
                <Space size={[6, 6]} wrap style={{ marginBottom: 8 }}>
                  <SourceTag source={detail.source} />
                  <DiscoveryStatusTag status={detail.status} />
                  {detail.analysis ? <ScoreTag score={detail.analysis.score} isBadLead={detail.analysis.isBadLead} /> : null}
                  {detail.actionPlan ? <PriorityTag priority={detail.actionPlan.priority} /> : null}
                </Space>
                <Title level={4} style={{ margin: 0 }}>
                  {detail.title ?? 'Untitled discovery'}
                </Title>
                <Text type="secondary">{detail.companyName ?? 'Unknown company'}</Text>
              </div>

              <Descriptions
                size="small"
                column={{ xs: 1, sm: 2 }}
                bordered
                items={[
                  { key: 'country', label: 'Country', children: detail.country ?? 'Unknown' },
                  { key: 'budget', label: 'Budget', children: formatBudget(detail.budgetHint) },
                  { key: 'created', label: 'Created', children: formatDateTime(detail.createdAt) },
                  { key: 'updated', label: 'Updated', children: formatDateTime(detail.updatedAt) },
                ]}
              />

              <Card
                size="small"
                title={
                  <Flex align="center" gap={8}>
                    <RobotOutlined />
                    <span>AI intelligence</span>
                  </Flex>
                }
                extra={
                  canUseAi ? (
                    <Button
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={analyzingId === detail.id}
                      disabled={analysisJobActive}
                      onClick={() => void analyzeDiscovery(detail.id)}
                    >
                      {detail.analysis ? 'Re-analyze' : 'Analyze'}
                    </Button>
                  ) : null
                }
              >
                <Flex vertical gap={16}>
                  {showJobCard ? <AnalysisJobCard job={displayedJob} /> : null}

                  {!canUseAi ? (
                    <Alert
                      type="info"
                      showIcon
                      title="AI analysis is not available for this member"
                      description="Your role doesn't include ai.use."
                    />
                  ) : detail.analysis ? (
                    <>
                      <Flex align="center" justify="space-between" wrap gap={12}>
                        <Space size={[6, 6]} wrap>
                          <ScoreTag score={detail.analysis.score} isBadLead={detail.analysis.isBadLead} />
                          <UrgencyTag urgency={detail.analysis.urgency} />
                          {detail.actionPlan ? <PriorityTag priority={detail.actionPlan.priority} /> : null}
                          {detail.analysis.isBadLead ? (
                            <Tag color="error" variant="filled">
                              Bad lead
                            </Tag>
                          ) : null}
                        </Space>
                        {detail.actionPlan ? (
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            Due {formatDateTime(detail.actionPlan.dueAt)}
                          </Text>
                        ) : null}
                      </Flex>

                      {detail.actionPlan || detail.analysis.recommendedAction ? (
                        <Alert
                          type={
                            detail.actionPlan?.priority === 'critical'
                              ? 'error'
                              : detail.actionPlan?.priority === 'medium'
                                ? 'warning'
                                : 'info'
                          }
                          showIcon
                          title={detail.actionPlan?.recommendedAction ?? detail.analysis.recommendedAction ?? 'AI recommendation available'}
                          description={
                            detail.actionPlan ? (
                              <Flex vertical gap={8}>
                                <Space wrap size={[8, 8]}>
                                  <PriorityTag priority={detail.actionPlan.priority} />
                                  <Text type="secondary" style={{ fontSize: 13 }}>
                                    Due {formatDateTime(detail.actionPlan.dueAt)}
                                  </Text>
                                </Space>
                                <Text type="secondary">{detail.actionPlan.reason}</Text>
                              </Flex>
                            ) : undefined
                          }
                        />
                      ) : null}

                      <div>
                        <Text
                          type="secondary"
                          style={{
                            display: 'block',
                            fontSize: 12,
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em',
                          }}
                        >
                          AI rationale
                        </Text>
                        <Paragraph style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                          {detail.analysis.reason ?? 'No AI rationale recorded yet.'}
                        </Paragraph>
                      </div>

                      <div>
                        <Text
                          type="secondary"
                          style={{
                            display: 'block',
                            fontSize: 12,
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em',
                          }}
                        >
                          Service match
                        </Text>
                        {detail.analysis.serviceMatches.length > 0 ? (
                          <Space wrap size={[8, 8]} style={{ marginTop: 8 }}>
                            {detail.analysis.serviceMatches.map((match) => (
                              <Tag key={`${match.service}-${match.isPriority}`} color={match.isPriority ? 'blue' : 'default'} variant="filled">
                                {match.service} · {Math.round(match.confidence * 100)}%
                              </Tag>
                            ))}
                          </Space>
                        ) : (
                          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                            No mapped service match yet.
                          </Paragraph>
                        )}
                      </div>
                    </>
                  ) : displayedJob && !isTerminalJob(displayedJob) ? (
                    <Text type="secondary">
                      Analysis is running now. The inbox refreshes automatically when the new score lands.
                    </Text>
                  ) : (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No AI analysis yet. Run analysis to score this discovery and draft the next move."
                    />
                  )}
                </Flex>
              </Card>

              {(detail.contactName || detail.email || detail.phone || detail.website) ? (
                <Descriptions
                  title="Contact"
                  size="small"
                  column={1}
                  items={[
                    ...(detail.contactName
                      ? [{ key: 'name', label: 'Name', children: detail.contactName }]
                      : []),
                    ...(detail.email
                      ? [
                          {
                            key: 'email',
                            label: 'Email',
                            children: (
                              <Typography.Link href={`mailto:${detail.email}`}>
                                {detail.email}
                              </Typography.Link>
                            ),
                          },
                        ]
                      : []),
                    ...(detail.phone
                      ? [
                          {
                            key: 'phone',
                            label: 'Phone',
                            children: (
                              <Typography.Link href={`tel:${detail.phone}`}>
                                {detail.phone}
                              </Typography.Link>
                            ),
                          },
                        ]
                      : []),
                    ...(detail.website
                      ? [
                          {
                            key: 'web',
                            label: 'Website',
                            children: (
                              <Typography.Link href={detail.website} target="_blank" rel="noreferrer">
                                {detail.website}
                              </Typography.Link>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              ) : null}

              <div>
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                  }}
                >
                  Description
                </Text>
                <Paragraph
                  style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}
                  type={detail.description ? undefined : 'secondary'}
                >
                  {detail.description ?? 'No free-text description captured yet.'}
                </Paragraph>
              </div>

              {canWrite ? (
                <>
                  <Divider style={{ margin: 0 }} />
                  {actionButtons([detail.id], 'middle')}
                </>
              ) : null}

              <Collapse
                size="small"
                items={[
                  {
                    key: 'raw',
                    label: 'Raw payload',
                    children: (
                      <>
                        <Text type="secondary" className="font-mono" style={{ fontSize: 12 }}>
                          batch {detail.batchId ?? 'unassigned'}
                          {detail.dedupHash ? ` · dedup ${detail.dedupHash.slice(0, 12)}` : ''}
                        </Text>
                        <pre
                          style={{
                            marginTop: 8,
                            maxHeight: 360,
                            overflow: 'auto',
                            padding: 12,
                            borderRadius: token.borderRadius,
                            background: 'rgba(0,0,0,0.28)',
                            fontSize: 12,
                          }}
                        >
                          {JSON.stringify(detail.rawPayload, null, 2)}
                        </pre>
                      </>
                    ),
                  },
                ]}
              />
            </Flex>
          )}
        </Card>
      </Row3>
    </Flex>
  );
}

function Row3({ children }: { children: React.ReactNode[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 24,
        gridTemplateColumns: 'minmax(240px, 1fr) minmax(320px, 1.4fr) minmax(360px, 1.8fr)',
        alignItems: 'start',
      }}
      className="inbox-grid"
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text
        type="secondary"
        style={{
          display: 'block',
          marginBottom: 8,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
        }}
      >
        {label}
      </Text>
      {children}
    </div>
  );
}
