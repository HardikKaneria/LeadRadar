import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import type { LeadHuntingPostSummary, LeadHuntingSessionSummary } from '@radar/contracts';
import { App, Button, Flex, Result, Space, Table, Tag, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { LeadHuntingPostsTable } from '@/components/lead-hunting/lead-hunting-posts-table';
import { PageHeader } from '@/components/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { PageSection } from '@/components/ui/page-section';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const { Link, Text } = Typography;

export default function LeadHuntingSessionPage() {
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const { accessToken, currentOrg, can } = useAuth();
  const { message } = App.useApp();
  const [session, setSession] = useState<LeadHuntingSessionSummary | null>(null);
  const [posts, setPosts] = useState<LeadHuntingPostSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const ctx = useMemo(
    () =>
      accessToken && currentOrg
        ? { accessToken, organizationId: currentOrg.organizationId }
        : null,
    [accessToken, currentOrg],
  );

  const canRead = can('lead_hunting.read');

  async function load() {
    if (!ctx || !canRead || !params.id) return;
    setLoading(true);
    try {
      const [sessionResult, postsResult] = await Promise.all([
        api.leadHuntingSession(ctx, params.id),
        api.leadHuntingPosts(ctx, { sessionId: params.id, page: 1, pageSize: 100 }),
      ]);
      setSession(sessionResult);
      setPosts(postsResult.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load session');
      setSession(null);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [ctx, canRead, params.id]);

  if (!ctx) {
    return <Result status="info" title="Sign in to view this lead-hunting session" />;
  }
  if (!canRead) {
    return <Result status="403" title="Your role cannot access this lead-hunting session" />;
  }
  if (!params.id) {
    return <Result status="404" title="Session not found" />;
  }

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Session"
        title={session?.searchQuery ?? 'Lead-hunting session'}
        subtitle="Inspect one capture session end to end, from visible LinkedIn results through researched post decisions."
        extra={
          <>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/lead-hunting')}>
              Back
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
          </>
        }
      />

      <Flex gap={16} wrap>
        <MetricCard eyebrow="Captured" value={session?.totalPostsCaptured.toLocaleString() ?? '—'} loading={loading} />
        <MetricCard eyebrow="Unique" value={session?.totalUniquePosts.toLocaleString() ?? '—'} loading={loading} />
        <MetricCard eyebrow="Qualified" value={session?.totalQualified.toLocaleString() ?? '—'} loading={loading} />
        <MetricCard eyebrow="Needs review" value={session?.totalNeedsReview.toLocaleString() ?? '—'} loading={loading} />
      </Flex>

      <PageSection title="Session metadata" subtitle="Capture settings and source context for this LinkedIn search session.">
        {session ? (
          <Space wrap size={[8, 8]}>
            <Tag>{session.sourcePlatform}</Tag>
            <Tag color="blue">{session.captureMode}</Tag>
            <Tag color="processing">{session.status}</Tag>
            {session.parserVersion ? <Tag>{session.parserVersion}</Tag> : null}
            <Text type="secondary">{new Date(session.createdAt).toLocaleString()}</Text>
            {session.searchUrl ? (
              <Link href={session.searchUrl} target="_blank">
                Open captured search
              </Link>
            ) : null}
          </Space>
        ) : null}
      </PageSection>

      <PageSection title="Posts in this session" subtitle="Every raw post captured for this search session, with the latest research status.">
        <LeadHuntingPostsTable
          items={posts}
          loading={loading}
          onOpen={(item) => navigate(`/lead-hunting/posts/${item.id}`)}
          showSession={false}
          emptyDescription="No posts were linked to this session."
        />
      </PageSection>
    </Flex>
  );
}
