'use client';

import { useEffect, useState, useCallback } from 'react';
import { Table, Card, Skeleton, App, Button, Tooltip } from 'antd';
import { ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { supabase } from '@/lib/supabase';
import dayjs from 'dayjs';

interface JobRunRow {
  id: string;
  organization_id: string;
  queue_name: string;
  job_name: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
  payload: any;
}

export default function AdminFailedJobsPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<JobRunRow[]>([]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('job_runs')
      .select('*')
      .eq('status', 'failed')
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

  const handleRetry = async (job: JobRunRow) => {
    setRetryingIds((prev) => new Set(prev).add(job.id));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/v1/jobs/${job.id}/retry`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token}`,
          'x-organization-id': job.organization_id, // Pass the job's org ID
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to retry job: ${res.statusText}`);
      }
      message.success('Job queued for retry');
    } catch (err: unknown) {
      if (err instanceof Error) message.error(err.message);
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
      fetchJobs();
    }
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
      title: 'Attempts',
      dataIndex: 'attempts',
      key: 'attempts',
      width: 90,
    },
    {
      title: 'Error',
      dataIndex: 'error',
      key: 'error',
      ellipsis: true,
      render: (err: string | null) =>
        err ? (
          <Tooltip title={err}>
            <span style={{ color: 'var(--ant-color-error)' }}>{err.slice(0, 100)}{err.length > 100 ? '…' : ''}</span>
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
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, row: JobRunRow) => (
        <Button
          size="small"
          icon={<UndoOutlined />}
          onClick={() => handleRetry(row)}
          loading={retryingIds.has(row.id)}
        >
          Retry
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Dead-Letter Queue"
        subtitle="Failed background jobs requiring manual intervention."
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
