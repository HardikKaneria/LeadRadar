import { useEffect, useMemo, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import type { LeadHuntingPostSummary } from '@radar/contracts';
import { App, Button, Flex, Result, Segmented } from 'antd';
import { useNavigate } from 'react-router-dom';
import { LeadHuntingPostsTable } from '@/components/lead-hunting/lead-hunting-posts-table';
import { PageHeader } from '@/components/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { PageSection } from '@/components/ui/page-section';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type ReviewQueue = 'review' | 'qualified';

export default function LeadHuntingReviewPage() {
  const navigate = useNavigate();
  const { accessToken, currentOrg, can } = useAuth();
  const { message } = App.useApp();
  const [queue, setQueue] = useState<ReviewQueue>('review');
  const [items, setItems] = useState<LeadHuntingPostSummary[]>([]);
  const [total, setTotal] = useState(0);
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
    if (!ctx || !canRead) return;
    setLoading(true);
    try {
      const result = await api.leadHuntingPosts(ctx, { queue, page: 1, pageSize: 50 });
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load review queue');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [ctx, canRead, queue]);

  if (!ctx) {
    return <Result status="info" title="Sign in to review lead-hunting decisions" />;
  }
  if (!canRead) {
    return <Result status="403" title="Your role cannot access the lead-hunting review queue" />;
  }

  const title = queue === 'review' ? 'Needs Review' : 'Qualified';
  const subtitle =
    queue === 'review'
      ? 'Research is complete, but these posts still need a human decision.'
      : 'These posts are strong enough to hand off into the CRM after operator approval.';

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Operator queue"
        title="Lead-Hunting Review"
        subtitle="Triage researched posts, inspect evidence, and decide what moves into the CRM."
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" onClick={() => navigate('/lead-hunting/archive')}>
              Open Archive
            </Button>
          </>
        }
      />

      <Flex gap={16} wrap>
        <MetricCard
          eyebrow="Current queue"
          value={title}
          loading={loading}
          caption={subtitle}
        />
        <MetricCard
          eyebrow="Visible posts"
          value={total.toLocaleString()}
          loading={loading}
          caption="Latest 50 rows are loaded in this table"
        />
      </Flex>

      <PageSection
        title="Queue filter"
        subtitle="Switch between posts that still need a decision and posts that already look qualified."
        extra={
          <Segmented<ReviewQueue>
            value={queue}
            onChange={(value) => setQueue(value as ReviewQueue)}
            options={[
              { label: 'Needs review', value: 'review' },
              { label: 'Qualified', value: 'qualified' },
            ]}
          />
        }
      >
        <LeadHuntingPostsTable
          items={items}
          loading={loading}
          onOpen={(item) => navigate(`/lead-hunting/posts/${item.id}`)}
          emptyDescription={`No ${title.toLowerCase()} posts are waiting right now.`}
        />
      </PageSection>
    </Flex>
  );
}
