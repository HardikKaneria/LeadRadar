
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Divider,
  Empty,
  Flex,
  Input,
  List,
  Pagination,
  Result,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Typography,
  theme,
} from 'antd';
import dayjs from 'dayjs';
import type {
  CompanyDetail,
  ContactSummary,
  OpportunityDetail,
  OpportunityFilter,
  OpportunitySetStatus,
  OpportunitySort,
  OpportunityStatus,
  OpportunitySummary,
  Priority,
  SimilarOpportunityDto,
} from '@radar/contracts';
import { OPPORTUNITY_SET_STATUSES } from '@radar/contracts';
import { getCompany, listCompanyContacts } from '@/lib/companies';
import {
  getOpportunity,
  listOpportunities,
  setOpportunityStatus,
} from '@/lib/opportunities';
import { promoteOpportunity } from '@/lib/leads';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { EntityTimeline } from '@/components/entity-timeline';
import {
  OpportunityStatusTag,
  PriorityTag,
  ScoreTag,
} from '@/components/ui/status-tag';

const { Text, Title, Paragraph } = Typography;

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { label: string; value: OpportunityStatus }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Promoted to lead', value: 'promoted_to_lead' },
  { label: 'Ignored', value: 'ignored' },
  { label: 'Expired', value: 'expired' },
  { label: 'Archived', value: 'archived' },
];

const PRIORITY_OPTIONS: { label: string; value: Priority }[] = [
  { label: 'Critical', value: 'critical' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
];

const SORT_OPTIONS: { label: string; value: OpportunitySort }[] = [
  { label: 'Score', value: 'score' },
  { label: 'Heat', value: 'heat' },
  { label: 'Priority', value: 'priority' },
  { label: 'Newest', value: 'newest' },
];

const SET_STATUS_LABEL: Record<OpportunitySetStatus, string> = {
  open: 'Reopen',
  qualified: 'Qualify',
  ignored: 'Ignore',
  archived: 'Archive',
};

function formatDateTime(value: string): string {
  return dayjs(value).format('MMM D, YYYY · h:mm A');
}

function formatValue(value: number | null, currency: string | null): string {
  if (value == null) return 'Unestimated';
  const amount = value.toLocaleString();
  return currency ? `${currency} ${amount}` : amount;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

interface FilterDraft {
  status: OpportunityStatus[];
  priority: Priority[];
  search: string;
  sort: OpportunitySort;
}

function emptyDraft(): FilterDraft {
  return { status: [], priority: [], search: '', sort: 'score' };
}

function buildFilter(draft: FilterDraft, page: number): OpportunityFilter {
  const filter: OpportunityFilter = { page, pageSize: PAGE_SIZE, sort: draft.sort };
  if (draft.status.length) filter.status = draft.status;
  if (draft.priority.length) filter.priority = draft.priority;
  const search = draft.search.trim();
  if (search) filter.search = search;
  return filter;
}

interface LinkedCompany {
  company: CompanyDetail;
  contacts: ContactSummary[];
}

export default function OpportunitiesPage() {
  const { currentOrg, can, accessToken } = useAuth();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const navigate = useNavigate();

  const organizationId = currentOrg?.organizationId ?? null;
  const canRead = can('opportunities.read');
  const canWrite = can('opportunities.write');
  const canPromote = can('leads.write') || can('leads.write_own');

  const [draft, setDraft] = useState<FilterDraft>(emptyDraft);
  const [filters, setFilters] = useState<OpportunityFilter>(() => buildFilter(emptyDraft(), 1));
  const [items, setItems] = useState<OpportunitySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [linkedCompany, setLinkedCompany] = useState<LinkedCompany | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busyStatus, setBusyStatus] = useState<OpportunitySetStatus | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  
  const [similarOpps, setSimilarOpps] = useState<SimilarOpportunityDto[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  useEffect(() => {
    if (!organizationId || !canRead) {
      setItems([]);
      setTotal(0);
      setActiveId(null);
      setDetail(null);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    void listOpportunities(organizationId, filters)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setActiveId((current) =>
          current && result.items.some((item) => item.id === current)
            ? current
            : result.items[0]?.id ?? null,
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
    setLinkedCompany(null);
    setSimilarOpps([]);
    setSimilarLoading(true);
    void getOpportunity(organizationId, activeId)
      .then(async (result) => {
        if (cancelled) return;
        setDetail(result);
        if (result?.companyId) {
          const [company, contacts] = await Promise.all([
            getCompany(organizationId, result.companyId),
            listCompanyContacts(organizationId, result.companyId),
          ]);
          if (!cancelled && company) setLinkedCompany({ company, contacts });
        }
        
        if (!cancelled && accessToken && organizationId) {
          api.getSimilarOpportunities({ accessToken, organizationId }, activeId)
            .then((sim) => {
              if (!cancelled) setSimilarOpps(sim);
            })
            .catch(() => {
              // ignore errors for similar opps
            })
            .finally(() => {
              if (!cancelled) setSimilarLoading(false);
            });
        }
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

  async function runStatusAction(id: string, status: OpportunitySetStatus) {
    if (!organizationId) return;
    setBusyStatus(status);
    try {
      await setOpportunityStatus(organizationId, [id], status);
      message.success(`Opportunity ${SET_STATUS_LABEL[status].toLowerCase()}d`);
      setReloadToken((value) => value + 1);
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setBusyStatus(null);
    }
  }

  async function runPromote(id: string) {
    setPromoting(true);
    try {
      await promoteOpportunity({ opportunityId: id });
      message.success('Promoted to lead');
      navigate('/pipeline');
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setPromoting(false);
    }
  }

  function applyFilters() {
    setFilters(buildFilter(draft, 1));
  }

  function resetFilters() {
    const next = emptyDraft();
    setDraft(next);
    setFilters(buildFilter(next, 1));
  }

  function setPage(page: number) {
    setFilters((current) => ({ ...current, page }));
  }

  if (!currentOrg) {
    return (
      <Result
        status="info"
        title="No workspace yet"
        subTitle="Join or create a workspace before reviewing opportunities."
      />
    );
  }

  if (!canRead) {
    return (
      <Result
        status="403"
        title="No access"
        subTitle="Your current role does not include opportunities.read."
      />
    );
  }

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Pipeline"
        title="Opportunities"
        subtitle="The ranked shortlist of approved opportunities — sorted by score, heat, and priority so the next move is obvious."
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => setReloadToken((value) => value + 1)}
            loading={listLoading}
          >
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
                placeholder="Website rebuild"
                value={draft.search}
                onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
                onPressEnter={applyFilters}
              />
            </Field>
            <Field label="Sort">
              <Segmented
                block
                value={draft.sort}
                onChange={(value) => setDraft((current) => ({ ...current, sort: value as OpportunitySort }))}
                options={SORT_OPTIONS}
              />
            </Field>
            <Field label="Status">
              <Checkbox.Group
                value={draft.status}
                onChange={(value) => setDraft((current) => ({ ...current, status: value as OpportunityStatus[] }))}
                options={STATUS_OPTIONS}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              />
            </Field>
            <Field label="Priority">
              <Checkbox.Group
                value={draft.priority}
                onChange={(value) => setDraft((current) => ({ ...current, priority: value as Priority[] }))}
                options={PRIORITY_OPTIONS}
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
              Ranked
              <Badge count={total} overflowCount={9999} color={token.colorPrimary} />
            </Flex>
          }
          size="small"
        >
          {listError ? (
            <Alert type="error" showIcon title={listError} />
          ) : listLoading && items.length === 0 ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : items.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No opportunities yet. Approve discoveries in the Inbox to convert them here."
            />
          ) : (
            <>
              <List
                dataSource={items}
                renderItem={(item) => {
                  const active = item.id === activeId;
                  return (
                    <div
                      onClick={() => setActiveId(item.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: 12,
                        marginBottom: 8,
                        borderRadius: token.borderRadiusLG,
                        cursor: 'pointer',
                        border: `1px solid ${active ? token.colorPrimary : token.colorBorderSecondary}`,
                        background: active ? token.colorPrimaryBg : 'transparent',
                      }}
                    >
                      <Space size={[6, 6]} wrap>
                        <OpportunityStatusTag status={item.status} />
                        <ScoreTag score={item.score} />
                        <PriorityTag priority={item.priority} />
                      </Space>
                      <Text strong ellipsis style={{ display: 'block' }}>
                        {item.title}
                      </Text>
                      <Flex gap={12} wrap>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Heat {Math.round(item.heatScore)}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Value {formatValue(item.potentialValue, null)}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatDateTime(item.createdAt)}
                        </Text>
                      </Flex>
                    </div>
                  );
                }}
              />

              <Flex justify="center" style={{ marginTop: 12 }}>
                <Pagination
                  current={filters.page}
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

        <Card title="Detail" size="small">
          {detailError ? (
            <Alert type="error" showIcon title={detailError} />
          ) : detailLoading && !detail ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : !detail ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Choose an opportunity to inspect it here."
            />
          ) : (
            <Flex vertical gap={16}>
              <div>
                <Space size={[6, 6]} wrap style={{ marginBottom: 8 }}>
                  <OpportunityStatusTag status={detail.status} />
                  <ScoreTag score={detail.score} />
                  <PriorityTag priority={detail.priority} />
                </Space>
                <Title level={4} style={{ margin: 0 }}>
                  {detail.title}
                </Title>
                {linkedCompany ? (
                  <Text type="secondary">{linkedCompany.company.name}</Text>
                ) : null}
              </div>

              <Flex gap={24} wrap>
                <Statistic title="Score" value={detail.score} />
                <Statistic title="Heat" value={Math.round(detail.heatScore)} />
                <Statistic
                  title="Potential value"
                  value={formatValue(detail.potentialValue, detail.currency)}
                />
              </Flex>

              {detail.recommendedAction ? (
                <Alert
                  type={detail.priority === 'critical' ? 'error' : detail.priority === 'medium' || detail.priority === 'low' ? 'info' : 'warning'}
                  showIcon
                  icon={<RobotOutlined />}
                  title={detail.recommendedAction}
                />
              ) : null}

              <Descriptions
                size="small"
                column={{ xs: 1, sm: 2 }}
                bordered
                items={[
                  { key: 'priority', label: 'Priority', children: detail.priority },
                  { key: 'weight', label: 'Priority weight', children: detail.priorityWeight },
                  {
                    key: 'expires',
                    label: 'Expires',
                    children: detail.expiresAt ? formatDateTime(detail.expiresAt) : 'No expiry set',
                  },
                  { key: 'created', label: 'Created', children: formatDateTime(detail.createdAt) },
                  { key: 'updated', label: 'Updated', children: formatDateTime(detail.updatedAt) },
                ]}
              />

              <div>
                <Text
                  type="secondary"
                  style={{ display: 'block', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}
                >
                  AI explanation
                </Text>
                <Paragraph
                  style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}
                  type={detail.aiExplanation ? undefined : 'secondary'}
                >
                  {detail.aiExplanation ?? 'No AI explanation recorded for this opportunity.'}
                </Paragraph>
              </div>

              {detail.description ? (
                <div>
                  <Text
                    type="secondary"
                    style={{ display: 'block', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}
                  >
                    Description
                  </Text>
                  <Paragraph style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    {detail.description}
                  </Paragraph>
                </div>
              ) : null}

              {similarLoading ? (
                <Skeleton active paragraph={{ rows: 2 }} />
              ) : similarOpps.length > 0 ? (
                <div>
                  <Text
                    type="secondary"
                    style={{ display: 'block', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}
                  >
                    Similar Deals
                  </Text>
                  <Flex gap={12} wrap>
                    {similarOpps.map((opp) => (
                      <Card
                        key={opp.id}
                        size="small"
                        style={{ width: 240, cursor: 'pointer' }}
                        onClick={() => setActiveId(opp.id)}
                        hoverable
                      >
                        <Text strong ellipsis style={{ display: 'block' }}>{opp.title}</Text>
                        <Space style={{ marginTop: 4 }}>
                          <OpportunityStatusTag status={opp.status as OpportunityStatus} />
                          <ScoreTag score={opp.score} />
                        </Space>
                        <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                          {Math.round(opp.similarity * 100)}% match
                        </Text>
                      </Card>
                    ))}
                  </Flex>
                </div>
              ) : null}

              {linkedCompany ? (
                <Card
                  size="small"
                  title={
                    <Flex align="center" gap={8}>
                      <span>{linkedCompany.company.name}</span>
                    </Flex>
                  }
                >
                  <Descriptions
                    size="small"
                    column={1}
                    items={[
                      ...(linkedCompany.company.domain
                        ? [{ key: 'domain', label: 'Domain', children: linkedCompany.company.domain }]
                        : []),
                      ...(linkedCompany.company.industry
                        ? [{ key: 'industry', label: 'Industry', children: linkedCompany.company.industry }]
                        : []),
                      ...(linkedCompany.company.country
                        ? [{ key: 'country', label: 'Country', children: linkedCompany.company.country }]
                        : []),
                      {
                        key: 'contacts',
                        label: 'Contacts',
                        children: linkedCompany.contacts.length
                          ? linkedCompany.contacts.map((contact) => contact.name).join(', ')
                          : 'No contacts yet',
                      },
                    ]}
                  />
                </Card>
              ) : null}

              {canPromote && detail.status !== 'promoted_to_lead' ? (
                <>
                  <Divider style={{ margin: 0 }} />
                  <Button
                    type="primary"
                    block
                    loading={promoting}
                    onClick={() => void runPromote(detail.id)}
                  >
                    Promote to lead
                  </Button>
                </>
              ) : null}

              {canWrite ? (
                <>
                  <Divider style={{ margin: 0 }} />
                  <Space wrap>
                    {OPPORTUNITY_SET_STATUSES.filter((status) => status !== detail.status).map((status) => (
                      <Button
                        key={status}
                        type={status === 'qualified' ? 'primary' : 'default'}
                        loading={busyStatus === status}
                        onClick={() => void runStatusAction(detail.id, status)}
                      >
                        {SET_STATUS_LABEL[status]}
                      </Button>
                    ))}
                  </Space>
                </>
              ) : null}

              <Divider style={{ margin: 0 }} />
              {organizationId ? (
                <EntityTimeline
                  organizationId={organizationId}
                  target={{ entityType: 'opportunity', entityId: detail.id }}
                  canWrite={canWrite}
                />
              ) : null}
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
        gridTemplateColumns: 'minmax(220px, 1fr) minmax(300px, 1.3fr) minmax(360px, 1.9fr)',
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
        style={{ display: 'block', marginBottom: 8, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}
      >
        {label}
      </Text>
      {children}
    </div>
  );
}
