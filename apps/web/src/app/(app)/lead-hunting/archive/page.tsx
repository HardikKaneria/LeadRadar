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

type ArchiveQueue = 'archive' | 'rejected';

export default function LeadHuntingArchivePage() {
  const navigate = useNavigate();
  const { accessToken, currentOrg, can } = useAuth();
  const { message } = App.useApp();
  const [queue, setQueue] = useState<ArchiveQueue>('archive');
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
      message.error(err instanceof Error ? err.message : 'Failed to load archive');
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
    return <Result status="info" title="Sign in to review the lead-hunting archive" />;
  }
  if (!canRead) {
    return <Result status="403" title="Your role cannot access the lead-hunting archive" />;
  }

  const title = queue === 'archive' ? 'Archived posts' : 'Rejected posts';

  return (
    <Flex vertical gap={24}>
      <PageHeader
        eyebrow="Archive"
        title="Lead-Hunting Archive"
        subtitle="Inspect informational market signals and rejected posts without polluting the CRM queue."
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" onClick={() => navigate('/lead-hunting/review')}>
              Open Review Queue
            </Button>
          </>
        }
      />

      <Flex gap={16} wrap>
        <MetricCard eyebrow="Current view" value={title} loading={loading} />
        <MetricCard
          eyebrow="Visible posts"
          value={total.toLocaleString()}
          loading={loading}
          caption="Latest 50 rows are loaded in this table"
        />
      </Flex>

      <PageSection
        title="Archive filter"
        subtitle="Switch between archived market intelligence and fully rejected posts."
        extra={
          <Segmented<ArchiveQueue>
            value={queue}
            onChange={(value) => setQueue(value as ArchiveQueue)}
            options={[
              { label: 'Archive', value: 'archive' },
              { label: 'Rejected', value: 'rejected' },
            ]}
          />
        }
      >
        <LeadHuntingPostsTable
          items={items}
          loading={loading}
          onOpen={(item) => navigate(`/lead-hunting/posts/${item.id}`)}
          emptyDescription={`No ${title.toLowerCase()} are available right now.`}
        />
      </PageSection>
    </Flex>
  );
}
