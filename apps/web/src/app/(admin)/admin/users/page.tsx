
import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Card, Skeleton, App } from 'antd';
import { PageHeader } from '@/components/page-header';
import { supabase } from '@/lib/supabase';
import dayjs from 'dayjs';

interface MembershipRow {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  organizations: { name: string } | null;
  roles: { name: string; slug: string } | null;
  profiles?: { name: string; email: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'green',
  invited: 'blue',
  suspended: 'red',
  deactivated: 'default',
};

const columns = [
  {
    title: 'User ID',
    dataIndex: 'user_id',
    key: 'user_id',
    render: (uid: string) => <code title={uid}>{uid.slice(0, 8)}…</code>,
  },
  {
    title: 'User Name',
    key: 'user_name',
    render: (_: unknown, row: MembershipRow) => {
      if (!row.profiles) return <span style={{ color: '#888' }}>No Profile</span>;
      return (
        <div>
          <div>{row.profiles.name || 'Unnamed'}</div>
          <div style={{ fontSize: '0.85em', color: '#888' }}>{row.profiles.email}</div>
        </div>
      );
    },
  },
  {
    title: 'Organization',
    key: 'organization',
    render: (_: unknown, row: MembershipRow) => row.organizations?.name ?? '—',
  },
  {
    title: 'Role',
    key: 'role',
    render: (_: unknown, row: MembershipRow) => row.roles?.name ?? row.roles?.slug ?? '—',
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    render: (status: string) => (
      <Tag color={STATUS_COLORS[status] ?? 'default'}>{status.toUpperCase()}</Tag>
    ),
  },
  {
    title: 'Joined',
    dataIndex: 'created_at',
    key: 'created_at',
    render: (val: string) => dayjs(val).format('YYYY-MM-DD HH:mm'),
  },
];

export default function AdminUsersPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);

  const fetchMemberships = useCallback(async () => {
    setLoading(true);
    // `profiles` has no direct FK to `memberships` (both key off auth.users), so the embedded join
    // can fail depending on PostgREST relationship detection — fall back to a manual id-based join.
    const { data, error } = await supabase
      .from('memberships')
      .select('id, user_id, status, created_at, organizations(name), roles(name, slug), profiles(name, email)')
      .order('created_at', { ascending: false });
    if (error) {
      // If the join fails due to no FK, we fallback to a manual join
      console.error(error);
      // Manual fallback
      const { data: memData } = await supabase
        .from('memberships')
        .select('id, user_id, status, created_at, organizations(name), roles(name, slug)')
        .order('created_at', { ascending: false });
      
      if (memData && memData.length > 0) {
        const userIds = memData.map(m => m.user_id);
        const { data: profData } = await supabase.from('profiles').select('id, name, email').in('id', userIds);
        const profileMap = new Map((profData || []).map(p => [p.id, p]));
        
        const mergedData = memData.map(m => ({
          ...m,
          profiles: profileMap.get(m.user_id) || null
        }));
        setMemberships((mergedData as unknown as MembershipRow[]) ?? []);
      } else {
        setMemberships([]);
      }
    } else {
      setMemberships((data as unknown as MembershipRow[]) ?? []);
    }
    setLoading(false);
  }, [message]);

  useEffect(() => {
    fetchMemberships();
  }, [fetchMemberships]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Users"
        subtitle="All user memberships across organizations."
      />

      <Card variant="borderless">
        {loading && memberships.length === 0 ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : (
          <Table
            columns={columns}
            dataSource={memberships}
            rowKey="id"
            pagination={{ pageSize: 20 }}
          />
        )}
      </Card>
    </div>
  );
}
