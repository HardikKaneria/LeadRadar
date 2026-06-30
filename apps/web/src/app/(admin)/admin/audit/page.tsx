import { useEffect, useState } from 'react';
import { Card, Table, Tag, Typography, Button, Input, Select, Space, Skeleton } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/page-header';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import dayjs from 'dayjs';

const { Text } = Typography;

interface AuditEntry {
  id: number;
  organization_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip: string | null;
  created_at: string;
  before: unknown;
  after: unknown;
}

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  insert: 'green',
  update: 'blue',
  delete: 'red',
};

export default function AdminAuditPage() {
  const { isPlatformAdmin } = useAuth();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [orgFilter, setOrgFilter] = useState<string>('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    let cancelled = false;
    setLoading(true);

    let q = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (entityTypeFilter) q = q.eq('entity_type', entityTypeFilter);
    if (actionFilter) q = q.eq('action', actionFilter);
    if (orgFilter) q = q.eq('organization_id', orgFilter);

    void q.then(({ data, count, error }) => {
      if (cancelled || error) return;
      setEntries((data ?? []) as AuditEntry[]);
      setTotal(count ?? 0);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [isPlatformAdmin, page, entityTypeFilter, actionFilter, orgFilter, reloadToken]);

  const columns = [
    {
      title: 'Time',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (v: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(v).format('MMM D HH:mm:ss')}</Text>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (v: string) => <Tag color={ACTION_COLORS[v] ?? 'default'}>{v.toUpperCase()}</Tag>,
    },
    {
      title: 'Entity',
      key: 'entity',
      render: (_: unknown, row: AuditEntry) => (
        <div>
          <Text strong style={{ fontSize: 12 }}>{row.entity_type}</Text>
          {row.entity_id && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{row.entity_id.slice(0, 8)}…</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Actor',
      dataIndex: 'actor_id',
      key: 'actor_id',
      render: (v: string | null) => v ? <Text style={{ fontSize: 12 }}>{v.slice(0, 8)}…</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Org',
      dataIndex: 'organization_id',
      key: 'organization_id',
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v.slice(0, 8)}…</Text>,
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      render: (v: string | null) => v ?? '—',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Audit Log"
        subtitle="All platform write operations — inserts, updates, and deletes across organisations."
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => { setPage(1); setReloadToken((n) => n + 1); }}
            loading={loading}
          >
            Refresh
          </Button>
        }
      />

      <Card variant="borderless">
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="Filter by org ID prefix"
            prefix={<SearchOutlined />}
            value={orgFilter}
            onChange={(e) => { setOrgFilter(e.target.value); setPage(1); }}
            style={{ width: 220 }}
            allowClear
          />
          <Select
            placeholder="Entity type"
            value={entityTypeFilter || undefined}
            onChange={(v) => { setEntityTypeFilter(v ?? ''); setPage(1); }}
            style={{ width: 160 }}
            allowClear
            options={[
              'organizations', 'users', 'leads', 'opportunities', 'companies',
              'contacts', 'tasks', 'proposals', 'ai_api_keys',
            ].map((v) => ({ value: v, label: v }))}
          />
          <Select
            placeholder="Action"
            value={actionFilter || undefined}
            onChange={(v) => { setActionFilter(v ?? ''); setPage(1); }}
            style={{ width: 130 }}
            allowClear
            options={['insert', 'update', 'delete'].map((v) => ({ value: v, label: v.toUpperCase() }))}
          />
        </Space>

        {loading && entries.length === 0 ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : (
          <Table
            columns={columns}
            dataSource={entries}
            rowKey="id"
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total,
              onChange: setPage,
              showTotal: (t) => `${t.toLocaleString()} entries`,
            }}
            size="small"
          />
        )}
      </Card>
    </div>
  );
}
