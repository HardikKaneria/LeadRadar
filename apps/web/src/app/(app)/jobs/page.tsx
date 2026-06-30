
import { useCallback, useEffect, useState } from 'react';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { App, Button, Progress, Table, Typography, type TableProps } from 'antd';
import { api, type Job } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { PageSection } from '@/components/ui/page-section';
import { JobStatusTag } from '@/components/ui/status-tag';

const { Text } = Typography;

const JOB_STATUS_FILTERS = ['queued', 'running', 'retrying', 'completed', 'failed', 'cancelled'];

export default function JobsPage() {
  const { accessToken, currentOrg } = useAuth();
  const { message } = App.useApp();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const ctx = accessToken && currentOrg ? { accessToken, organizationId: currentOrg.organizationId } : null;

  const load = useCallback(async () => {
    if (!ctx) return;
    try {
      setJobs(await api.jobs(ctx));
    } catch {
      /* transient — next poll retries */
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [load]);

  async function runDemo() {
    if (!ctx) return;
    setBusy(true);
    try {
      await api.enqueueDemo(ctx);
      message.success('Demo job enqueued');
      await load();
    } catch {
      message.error('Could not enqueue the demo job');
    } finally {
      setBusy(false);
    }
  }

  const columns: TableProps<Job>['columns'] = [
    {
      title: 'Job',
      dataIndex: 'job_name',
      key: 'job_name',
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      filters: JOB_STATUS_FILTERS.map((s) => ({ text: s, value: s })),
      onFilter: (value, record) => record.status === value,
      render: (status: string) => <JobStatusTag status={status} />,
    },
    {
      title: 'Progress',
      dataIndex: 'progress',
      key: 'progress',
      width: 240,
      render: (progress: number, record) => (
        <Progress
          percent={Math.min(100, Math.max(0, progress ?? 0))}
          size="small"
          status={record.status === 'failed' || record.status === 'cancelled' ? 'exception' : undefined}
        />
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        eyebrow="Operations"
        title="Jobs"
        subtitle="Async work tracked in job_runs. Capture, imports, and analysis all run here."
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} disabled={!ctx}>
              Refresh
            </Button>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={busy} disabled={!ctx} onClick={() => void runDemo()}>
              Run demo job
            </Button>
          </>
        }
      />

      <PageSection
        title="Job activity"
        subtitle="Queue-backed capture, import, and AI work stays observable here."
        extra={<Text type="secondary" style={{ fontSize: 12 }}>Queue activity updates automatically.</Text>}
        bodyStyle={{ padding: 0 }}
      >
        <Table<Job>
          rowKey="id"
          columns={columns}
          dataSource={jobs}
          loading={loading && jobs.length === 0}
          size="small"
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{
            emptyText: <EmptyState description="No jobs yet. Run the demo job or capture a discovery to see queue progress here." />,
          }}
        />
      </PageSection>
    </div>
  );
}
