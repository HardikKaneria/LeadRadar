import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import type { LeadHuntingPostDetail } from '@radar/contracts';
import { Alert, App, Button, Descriptions, Flex, List, Progress, Result, Space, Tag, Tabs, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { LeadHuntingClassificationTag, RawPostStatusTag, ScoreTag } from '@/components/ui/status-tag';
import { PageHeader } from '@/components/page-header';
import { PageSection } from '@/components/ui/page-section';
import { api, type Job } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const { Paragraph, Text, Link } = Typography;
const ACTIVE_JOB_STATUSES = new Set(['queued', 'running', 'retrying']);

function jsonBlock(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export default function LeadHuntingPostPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const { accessToken, currentOrg, can } = useAuth();
  const { message } = App.useApp();
  const [detail, setDetail] = useState<LeadHuntingPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);

  const ctx = useMemo(
    () =>
      accessToken && currentOrg
        ? { accessToken, organizationId: currentOrg.organizationId }
        : null,
    [accessToken, currentOrg],
  );

  const canRead = can('lead_hunting.read');
  const canReview = can('lead_hunting.review');

  async function load() {
    if (!ctx || !canRead || !params.id) return;
    setLoading(true);
    try {
      const next = await api.leadHuntingPost(ctx, params.id);
      setDetail(next);
      setJob(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load raw post');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [ctx, canRead, params.id]);

  useEffect(() => {
    if (!ctx) return;
    const candidate = job?.id ?? detail?.latestJob?.jobRunId ?? null;
    const status = job?.status ?? detail?.latestJob?.status ?? null;
    if (!candidate || !status || !ACTIVE_JOB_STATUSES.has(status)) return;

    const timer = setInterval(() => {
      void api
        .job(ctx, candidate)
        .then((next) => {
          setJob(next);
          if (!ACTIVE_JOB_STATUSES.has(next.status)) {
            void load();
          }
        })
        .catch(() => undefined);
    }, 2000);

    return () => clearInterval(timer);
  }, [ctx, detail?.latestJob?.jobRunId, detail?.latestJob?.status, job?.id, job?.status]);

  async function performAction(action: 'research' | 'classify' | 'approve' | 'archive' | 'reject') {
    if (!ctx || !params.id) return;
    setBusy(true);
    try {
      if (action === 'research') {
        const accepted = await api.enqueueLeadHuntingResearch(ctx, params.id);
        setJob({ id: accepted.jobId, job_name: 'research-raw-post', status: 'queued', progress: 0 });
        message.success('Research job queued');
      } else if (action === 'classify') {
        await api.reclassifyLeadHuntingPost(ctx, params.id);
        message.success('Post reclassified');
        await load();
      } else if (action === 'approve') {
        await api.approveLeadHuntingPost(ctx, params.id);
        message.success('Post approved into the CRM');
        await load();
      } else if (action === 'archive') {
        await api.archiveLeadHuntingPost(ctx, params.id);
        message.success('Post archived');
        await load();
      } else {
        await api.rejectLeadHuntingPost(ctx, params.id);
        message.success('Post rejected');
        await load();
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (!ctx) {
    return <Result status="info" title="Sign in to inspect this lead-hunting post" />;
  }
  if (!canRead) {
    return <Result status="403" title="Your role cannot access this lead-hunting post" />;
  }
  if (!params.id) {
    return <Result status="404" title="Raw post not found" />;
  }

  const activeJob = job ?? (detail?.latestJob?.jobRunId
    ? {
        id: detail.latestJob.jobRunId,
        job_name: 'research-raw-post',
        status: detail.latestJob.status,
        progress: detail.latestJob.progress,
        error: detail.latestJob.lastError,
      }
    : null);

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Raw post"
        title={detail?.postOwnerName ?? 'Lead-hunting post'}
        subtitle="Review evidence, provider activity, and the final operator decision for one captured post."
        extra={
          <>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/lead-hunting/review')}>
              Back
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
            {canReview && detail?.status !== 'archived' && detail?.status !== 'rejected' ? (
              <Button
                type="primary"
                loading={busy}
                onClick={() => void performAction('approve')}
              >
                Approve
              </Button>
            ) : null}
          </>
        }
      />

      {detail?.failureReason ? (
        <Alert type="error" showIcon message="Research failure" description={detail.failureReason} />
      ) : null}

      {detail?.missingSignals.length ? (
        <Alert
          type="warning"
          showIcon
          message="Missing-field cues"
          description={detail.missingSignals.join(', ')}
        />
      ) : null}

      {activeJob && ACTIVE_JOB_STATUSES.has(activeJob.status) ? (
        <Alert
          type="info"
          showIcon
          message="Research job in progress"
          description={
            <Flex vertical gap={8}>
              <Text>
                Job {activeJob.id.slice(0, 8)} is {activeJob.status}.
              </Text>
              <Progress percent={Math.min(100, Math.max(0, activeJob.progress ?? 0))} />
            </Flex>
          }
        />
      ) : null}

      <PageSection
        title="Post summary"
        subtitle="Visible LinkedIn metadata, current state, and operator actions."
        extra={
          canReview ? (
            <Space wrap>
              <Button loading={busy} onClick={() => void performAction('research')}>
                Rerun research
              </Button>
              <Button loading={busy} onClick={() => void performAction('classify')}>
                Reclassify
              </Button>
              <Button loading={busy} onClick={() => void performAction('archive')}>
                Archive
              </Button>
              <Button danger loading={busy} onClick={() => void performAction('reject')}>
                Reject
              </Button>
            </Space>
          ) : null
        }
      >
        {detail ? (
          <Flex vertical gap={16}>
            <Space wrap size={[8, 8]}>
              <RawPostStatusTag status={detail.status} />
              {detail.classification ? <LeadHuntingClassificationTag classification={detail.classification} /> : null}
              {detail.leadScore != null ? <ScoreTag score={detail.leadScore} /> : null}
              {detail.archived ? <Tag>{detail.archived.archiveCategory}</Tag> : null}
            </Space>

            <Descriptions
              column={{ xs: 1, md: 2, xl: 3 }}
              bordered
              items={[
                { key: 'owner', label: 'Owner', children: detail.postOwnerName ?? '—' },
                { key: 'headline', label: 'Headline', children: detail.postOwnerHeadline ?? '—' },
                {
                  key: 'company',
                  label: 'Visible company',
                  children: detail.visibleCompanyName ?? '—',
                },
                {
                  key: 'date',
                  label: 'Post date',
                  children: detail.postDate ? new Date(detail.postDate).toLocaleString() : '—',
                },
                {
                  key: 'recommended',
                  label: 'Recommended action',
                  children: detail.recommendedAction ?? '—',
                },
                {
                  key: 'discovery',
                  label: 'CRM discovery',
                  children: detail.discovery ? detail.discovery.title : 'Not linked',
                },
              ]}
            />

            {detail.postUrl ? (
              <Link href={detail.postUrl} target="_blank">
                Open original LinkedIn post
              </Link>
            ) : null}

            <Paragraph style={{ margin: 0 }}>
              {detail.postText ?? 'No captured post body.'}
            </Paragraph>
          </Flex>
        ) : null}
      </PageSection>

      <PageSection title="Research output" subtitle="Summaries, evidence, provider calls, and structured classifier output.">
        <Tabs
          items={[
            {
              key: 'report',
              label: 'Research',
              children: detail?.report ? (
                <Descriptions
                  column={1}
                  bordered
                  items={[
                    { key: 'person', label: 'Person', children: detail.report.personSummary ?? '—' },
                    { key: 'company', label: 'Company', children: detail.report.companySummary ?? '—' },
                    { key: 'website', label: 'Website', children: detail.report.websiteSummary ?? '—' },
                    { key: 'email', label: 'Email', children: detail.report.emailSummary ?? '—' },
                    { key: 'management', label: 'Management', children: detail.report.managementSummary ?? '—' },
                    { key: 'country', label: 'Country', children: detail.report.countrySummary ?? '—' },
                    {
                      key: 'opportunity',
                      label: 'Opportunity summary',
                      children: detail.report.opportunitySummary ?? '—',
                    },
                  ]}
                />
              ) : (
                <Text type="secondary">No persisted research report yet.</Text>
              ),
            },
            {
              key: 'evidence',
              label: `Evidence (${detail?.evidence.length ?? 0})`,
              children: (
                <List
                  dataSource={detail?.evidence ?? []}
                  locale={{ emptyText: 'No field evidence has been recorded yet.' }}
                  renderItem={(item) => (
                    <List.Item>
                      <Flex vertical gap={4} style={{ width: '100%' }}>
                        <Space wrap size={[8, 8]}>
                          <Tag>{item.fieldName}</Tag>
                          {item.sourceProvider ? <Tag color="blue">{item.sourceProvider}</Tag> : null}
                          {item.confidenceScore != null ? <Tag color="cyan">{item.confidenceScore}%</Tag> : null}
                        </Space>
                        <Text strong>{item.fieldValue ?? 'No extracted value'}</Text>
                        {item.evidenceText ? <Text type="secondary">{item.evidenceText}</Text> : null}
                        {item.sourceUrl ? (
                          <Link href={item.sourceUrl} target="_blank">
                            Evidence source
                          </Link>
                        ) : null}
                      </Flex>
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'providers',
              label: `Providers (${detail?.providerCalls.length ?? 0})`,
              children: (
                <List
                  dataSource={detail?.providerCalls ?? []}
                  locale={{ emptyText: 'No provider attempts were recorded for this post.' }}
                  renderItem={(item) => (
                    <List.Item>
                      <Flex vertical gap={4} style={{ width: '100%' }}>
                        <Space wrap size={[8, 8]}>
                          <Tag>{item.provider}</Tag>
                          <Tag>{item.taskType}</Tag>
                          <Tag color={item.status === 'ok' || item.status === 'cached' ? 'success' : 'error'}>
                            {item.status}
                          </Tag>
                        </Space>
                        <Text type="secondary">
                          Attempt {item.attemptNumber} · {item.latencyMs ?? 0} ms · ${item.estimatedCostUsd.toFixed(4)}
                        </Text>
                        {item.error ? <Text type="danger">{item.error}</Text> : null}
                      </Flex>
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'raw',
              label: 'Structured JSON',
              children: (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {jsonBlock({
                    report: detail?.report?.reportJson ?? null,
                    classification: detail?.classificationDetail?.reasonJson ?? null,
                  })}
                </pre>
              ),
            },
          ]}
        />
      </PageSection>
    </Flex>
  );
}
