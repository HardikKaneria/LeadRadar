
import { useEffect, useMemo, useState } from 'react';
import { ApartmentOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
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
  Tag,
  Typography,
  theme,
} from 'antd';
import dayjs from 'dayjs';
import type {
  CompanyDetail,
  CompanyFilter,
  CompanySort,
  CompanySummary,
  ContactSummary,
  RelationshipEdge,
  RelationshipNodeType,
} from '@radar/contracts';
import { getCompany, listCompanies, listCompanyContacts } from '@/lib/companies';
import { listEntityEdges } from '@/lib/relationships';
import { useAuth } from '@/lib/auth';
import { api, type Job } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { EntityTimeline } from '@/components/entity-timeline';

const { Text, Title, Paragraph } = Typography;

const PAGE_SIZE = 20;

const SORT_OPTIONS: { label: string; value: CompanySort }[] = [
  { label: 'Name', value: 'name' },
  { label: 'Newest', value: 'newest' },
];

function toLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string): string {
  return dayjs(value).format('MMM D, YYYY');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

interface FilterDraft {
  search: string;
  industry: string;
  country: string;
  sort: CompanySort;
}

function emptyDraft(): FilterDraft {
  return { search: '', industry: '', country: '', sort: 'name' };
}

function buildFilter(draft: FilterDraft, page: number): CompanyFilter {
  const filter: CompanyFilter = { page, pageSize: PAGE_SIZE, sort: draft.sort };
  const search = draft.search.trim();
  if (search) filter.search = search;
  const industry = draft.industry.trim();
  if (industry) filter.industry = industry;
  const country = draft.country.trim();
  if (country) filter.country = country;
  return filter;
}

interface CompanyGraph {
  company: CompanyDetail;
  contacts: ContactSummary[];
  edges: RelationshipEdge[];
}

export default function CompaniesPage() {
  const { currentOrg, accessToken, can } = useAuth();
  const { message } = App.useApp();
  const { token } = theme.useToken();

  const organizationId = currentOrg?.organizationId ?? null;
  const canRead = can('opportunities.read');
  const canWrite = can('opportunities.write'); // For research permission if needed, actually ai.use is probably better
  const canUseAi = can('ai.use');

  const [draft, setDraft] = useState<FilterDraft>(emptyDraft);
  const [filters, setFilters] = useState<CompanyFilter>(() => buildFilter(emptyDraft(), 1));
  const [items, setItems] = useState<CompanySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [graph, setGraph] = useState<CompanyGraph | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [researchJob, setResearchJob] = useState<Job | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!organizationId || !canRead) {
      setItems([]);
      setTotal(0);
      setActiveId(null);
      setGraph(null);
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    void listCompanies(organizationId, filters)
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
        setGraph(null);
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
      setGraph(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void Promise.all([
      getCompany(organizationId, activeId),
      listCompanyContacts(organizationId, activeId),
      listEntityEdges(organizationId, { type: 'company', id: activeId }),
    ])
      .then(([company, contacts, edges]) => {
        if (cancelled) return;
        setGraph(company ? { company, contacts, edges } : null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setGraph(null);
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
    if (!organizationId || !accessToken || !researchJob || researchJob.status === 'completed' || researchJob.status === 'failed') return;
    
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = await api.job({ accessToken, organizationId }, researchJob.id);
        if (!cancelled) setResearchJob(next);
      } catch {
        // ignore polling error
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [organizationId, accessToken, researchJob]);

  useEffect(() => {
    if (researchJob?.status === 'completed') {
       message.success('Company research completed');
       setReloadToken((v) => v + 1);
       setResearchJob(null);
    } else if (researchJob?.status === 'failed') {
       message.error(researchJob.error || 'Research failed');
       setResearchJob(null);
    }
  }, [researchJob, message]);

  async function researchCompany(id: string) {
    if (!organizationId || !accessToken) return;
    setIsResearching(true);
    try {
      const accepted = await api.researchCompany({ accessToken, organizationId }, id);
      setResearchJob({ id: accepted.jobId, job_name: 'research-company', status: 'new', progress: 0 });
      message.success('Company research queued');
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setIsResearching(false);
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
        subTitle="Join or create a workspace before browsing companies."
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
        eyebrow="Relationships"
        title="Companies"
        subtitle="The accounts behind your opportunities — their contacts and how everyone is connected."
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
            <Field label="Search name">
              <Input
                allowClear
                placeholder="Acme"
                value={draft.search}
                onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
                onPressEnter={applyFilters}
              />
            </Field>
            <Field label="Industry">
              <Input
                allowClear
                placeholder="SaaS"
                value={draft.industry}
                onChange={(event) => setDraft((current) => ({ ...current, industry: event.target.value }))}
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
            <Field label="Sort">
              <Segmented
                block
                value={draft.sort}
                onChange={(value) => setDraft((current) => ({ ...current, sort: value as CompanySort }))}
                options={SORT_OPTIONS}
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
              Companies
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
              description="No companies yet. They appear as opportunities are linked to accounts."
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
                        gap: 6,
                        padding: 12,
                        marginBottom: 8,
                        borderRadius: token.borderRadiusLG,
                        cursor: 'pointer',
                        border: `1px solid ${active ? token.colorPrimary : token.colorBorderSecondary}`,
                        background: active ? token.colorPrimaryBg : 'transparent',
                      }}
                    >
                      <Text strong ellipsis style={{ display: 'block' }}>
                        {item.name}
                      </Text>
                      <Flex gap={12} wrap>
                        {item.domain ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.domain}
                          </Text>
                        ) : null}
                        {item.industry ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.industry}
                          </Text>
                        ) : null}
                        {item.country ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {item.country}
                          </Text>
                        ) : null}
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

        <Card title="Company" size="small">
          {detailError ? (
            <Alert type="error" showIcon title={detailError} />
          ) : detailLoading && !graph ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : !graph ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Choose a company to see its contacts and relationships."
            />
          ) : (
            <CompanyGraphView
              graph={graph}
              canUseAi={canUseAi}
              organizationId={organizationId ?? ''}
              canWrite={canWrite}
              researchJob={researchJob}
              isResearching={isResearching}
              onResearch={() => activeId && researchCompany(activeId)}
            />
          )}
        </Card>
      </Row3>
    </Flex>
  );
}

function CompanyGraphView({
  graph,
  canUseAi,
  organizationId,
  canWrite,
  researchJob,
  isResearching,
  onResearch,
}: {
  graph: CompanyGraph;
  canUseAi: boolean;
  organizationId: string;
  canWrite: boolean;
  researchJob: Job | null;
  isResearching: boolean;
  onResearch: () => void;
}) {
  const { company, contacts, edges } = graph;

  // Resolve a polymorphic edge endpoint to a human label where we can (this company + its known
  // contacts); other endpoints fall back to a typed short id until cross-entity lookups land.
  const labelOf = useMemo(() => {
    const names = new Map<string, string>();
    names.set(`company:${company.id}`, company.name);
    for (const contact of contacts) names.set(`contact:${contact.id}`, contact.name);
    return (type: RelationshipNodeType, id: string): string =>
      names.get(`${type}:${id}`) ?? `${toLabel(type)} ${id.slice(0, 8)}`;
  }, [company, contacts]);

  const grouped = useMemo(() => {
    const byType = new Map<string, RelationshipEdge[]>();
    for (const edge of edges) {
      const list = byType.get(edge.edgeType) ?? [];
      list.push(edge);
      byType.set(edge.edgeType, list);
    }
    return [...byType.entries()];
  }, [edges]);

  return (
    <Flex vertical gap={16}>
      <div>
        <Title level={4} style={{ margin: 0 }}>
          {company.name}
        </Title>
        {company.domain ? <Text type="secondary">{company.domain}</Text> : null}
      </div>

      <Descriptions
        size="small"
        column={{ xs: 1, sm: 2 }}
        bordered
        items={[
          { key: 'industry', label: 'Industry', children: company.industry ?? '—' },
          { key: 'country', label: 'Country', children: company.country ?? '—' },
          { key: 'size', label: 'Size', children: company.size ?? '—' },
          { key: 'created', label: 'Added', children: formatDate(company.createdAt) },
        ]}
      />

      {company.techStack.length ? (
        <div>
          <SectionLabel>Tech stack</SectionLabel>
          <Space wrap size={[8, 8]} style={{ marginTop: 8 }}>
            {company.techStack.map((tech) => (
              <Tag key={tech} variant="filled">
                {tech}
              </Tag>
            ))}
          </Space>
        </div>
      ) : null}

      <Card
        size="small"
        title={
          <Flex align="center" gap={8}>
            Contacts
            <Badge count={contacts.length} showZero color="default" />
          </Flex>
        }
      >
        {contacts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No contacts linked yet." />
        ) : (
          <List
            size="small"
            dataSource={contacts}
            renderItem={(contact) => (
              <List.Item>
                <List.Item.Meta
                  title={contact.name}
                  description={
                    [contact.title, contact.email, contact.phone].filter(Boolean).join(' · ') || undefined
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>

      <Card
        size="small"
        title={
          <Flex align="center" gap={8}>
            <ApartmentOutlined />
            <span>Relationships</span>
            <Badge count={edges.length} showZero color="default" />
          </Flex>
        }
      >
        {grouped.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No relationship edges recorded for this company yet."
          />
        ) : (
          <Flex vertical gap={16}>
            {grouped.map(([edgeType, group]) => (
              <div key={edgeType}>
                <SectionLabel>{toLabel(edgeType)}</SectionLabel>
                <Flex vertical gap={8} style={{ marginTop: 8 }}>
                  {group.map((edge) => (
                    <Flex key={edge.id} align="center" justify="space-between" gap={12} wrap>
                      <Text>
                        {labelOf(edge.sourceType, edge.sourceId)}
                        <Text type="secondary"> → </Text>
                        {labelOf(edge.targetType, edge.targetId)}
                      </Text>
                      <Tag variant="filled">weight {edge.weight}</Tag>
                    </Flex>
                  ))}
                </Flex>
              </div>
            ))}
          </Flex>
        )}
      </Card>

      <div>
        <Flex align="center" justify="space-between" style={{ marginBottom: 8 }}>
          <SectionLabel>Enrichment</SectionLabel>
          {canUseAi && (
            <Button
              size="small"
              onClick={onResearch}
              loading={isResearching || (researchJob != null && researchJob.status !== 'completed' && researchJob.status !== 'failed')}
            >
              {researchJob != null ? 'Researching...' : 'Research company'}
            </Button>
          )}
        </Flex>
        
        {typeof company.enrichment === 'object' && company.enrichment && Object.keys(company.enrichment).length ? (
          <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 12 }} className="font-mono">
            {JSON.stringify(company.enrichment, null, 2)}
          </Paragraph>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {researchJob != null ? 'Research in progress...' : 'No AI enrichment data available yet.'}
          </Text>
        )}
      </div>

      <Divider style={{ margin: 0 }} />
      <EntityTimeline
        organizationId={organizationId}
        target={{ entityType: 'company', entityId: company.id }}
        canWrite={canWrite}
      />
    </Flex>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      type="secondary"
      style={{ display: 'block', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em' }}
    >
      {children}
    </Text>
  );
}

function Row3({ children }: { children: React.ReactNode[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 24,
        gridTemplateColumns: 'minmax(220px, 1fr) minmax(280px, 1.2fr) minmax(360px, 2fr)',
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
