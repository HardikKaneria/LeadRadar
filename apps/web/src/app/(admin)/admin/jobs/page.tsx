
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Card, Skeleton, App, Button, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { supabase } from '@/lib/supabase';
import dayjs from 'dayjs';

interface JobRunRow {
  id: string;
  queue_name: string;
  job_name: string;
  status: string;
  progress: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'default',
  running: 'processing',
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
  retrying: 'warning',
};

const columns = [
  {
    title: 'Queue',
    dataIndex: 'queue_name',
    key: 'queue_name',
    width: 140,
  },
  {
    title: 'Job Name',
    dataIndex: 'job_name',
    key: 'job_name',
    width: 180,
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    width: 110,
    render: (status: string) => (
      <Tag color={STATUS_COLORS[status] ?? 'default'}>{status.toUpperCase()}</Tag>
    ),
  },
  {
    title: 'Progress',
    dataIndex: 'progress',
    key: 'progress',
    width: 90,
    render: (val: number | null) => (val != null ? `${val}%` : '—'),
  },
  {
    title: 'Error',
    dataIndex: 'error',
    key: 'error',
    ellipsis: true,
    render: (err: string | null) =>
      err ? (
        <Tooltip title={err}>
          <span style={{ color: 'var(--ant-color-error)' }}>{err.slice(0, 60)}{err.length > 60 ? '…' : ''}</span>
        </Tooltip>
      ) : (
        '—'
      ),
  },
  {
    title: 'Created',
    dataIndex: 'created_at',
    key: 'created_at',
    width: 160,
    render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm'),
  },
  {
    title: 'Duration',
    key: 'duration',
    width: 100,
    render: (_: unknown, row: JobRunRow) => {
      if (!row.started_at) return '—';
      const end = row.finished_at ?? new Date().toISOString();
      const ms = dayjs(end).diff(dayjs(row.started_at));
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    },
  },
];

export default function AdminJobsPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobRunRow[]>([]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('job_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      message.error(error.message);
    } else {
      setJobs((data as unknown as JobRunRow[]) ?? []);
    }
    setLoading(false);
  }, [message]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Background Jobs"
        subtitle="Recent job_runs across all queues (last 50)."
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchJobs} loading={loading}>
            Refresh
          </Button>
        }
      />

      <Card variant="borderless">
        {loading && jobs.length === 0 ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : (
          <Table
            columns={columns}
            dataSource={jobs}
            rowKey="id"
            pagination={{ pageSize: 20 }}
            scroll={{ x: 900 }}
          />
        )}
      </Card>
    </div>
  );
}
