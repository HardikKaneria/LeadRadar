import { useEffect, useState } from 'react';
import {
  App,
  Badge,
  Button,
  Card,
  Empty,
  Flex,
  List,
  Select,
  Skeleton,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FireOutlined,
  LineChartOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { NotificationDto, NotificationPreferenceDto } from '@radar/contracts';
import { PageHeader } from '@/components/page-header';

dayjs.extend(relativeTime);

const { Text } = Typography;

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  lead_stale: { label: 'Lead stale', color: 'warning', icon: <ClockCircleOutlined style={{ color: '#faad14' }} /> },
  follow_up_due: { label: 'Follow-up due', color: 'processing', icon: <CheckCircleOutlined style={{ color: '#1890ff' }} /> },
  follow_up_overdue: { label: 'Follow-up overdue', color: 'error', icon: <WarningOutlined style={{ color: '#ff4d4f' }} /> },
  weekly_insight: { label: 'Weekly insight', color: 'purple', icon: <LineChartOutlined style={{ color: '#722ed1' }} /> },
  opportunity_expiring: { label: 'Expiring soon', color: 'volcano', icon: <FireOutlined style={{ color: '#fa541c' }} /> },
  general: { label: 'General', color: 'default', icon: <BellOutlined /> },
};

function notificationTitle(n: NotificationDto): string {
  switch (n.type) {
    case 'weekly_insight':
      return `Weekly insight: ${n.data?.winRate ?? 0}% win rate — ${n.data?.wonLeads ?? 0} won, ${n.data?.lostLeads ?? 0} lost`;
    case 'lead_stale':
      return n.data?.message ?? 'A lead has gone stale and needs attention';
    case 'follow_up_due':
      return n.data?.message ?? 'You have a follow-up task due today';
    case 'follow_up_overdue':
      return n.data?.message ?? 'You have an overdue follow-up task';
    case 'opportunity_expiring':
      return n.data?.message ?? 'An opportunity is expiring soon';
    default:
      return n.data?.message ?? n.type;
  }
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: NotificationDto;
  onRead: (id: string) => void;
}) {
  const meta = TYPE_META[notification.type] ?? TYPE_META.general;
  const isUnread = notification.status === 'unread';

  return (
    <List.Item
      style={{
        padding: '14px 16px',
        background: isUnread ? 'var(--ant-color-primary-bg)' : 'transparent',
        cursor: isUnread ? 'pointer' : 'default',
        borderBottom: '1px solid var(--ant-color-border-secondary)',
      }}
      onClick={() => { if (isUnread) onRead(notification.id); }}
      actions={[
        <Tag color={meta.color} key="type" style={{ fontSize: 11 }}>{meta.label}</Tag>,
      ]}
    >
      <List.Item.Meta
        avatar={
          <Flex align="center" justify="center" style={{ width: 36, height: 36, fontSize: 22 }}>
            {meta.icon}
          </Flex>
        }
        title={
          <Text strong={isUnread} style={{ fontSize: 13 }}>
            {notificationTitle(notification)}
          </Text>
        }
        description={
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(notification.createdAt).fromNow()}
          </Text>
        }
      />
    </List.Item>
  );
}

function NotificationFeed() {
  const { accessToken, currentOrg } = useAuth();
  const { message } = App.useApp();
  const ctx = { accessToken: accessToken ?? '', organizationId: currentOrg?.organizationId ?? '' };

  const [all, setAll] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    void api.listNotifications(ctx)
      .then((data) => { if (!cancelled) setAll(data); })
      .catch((err: unknown) => {
        if (cancelled) return;
        void message.error(err instanceof Error ? err.message : 'Failed to load notifications');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken, reloadToken]);

  async function markRead(id: string) {
    try {
      await api.updateNotification(ctx, id, { status: 'read' });
      setAll((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'read' } : n)));
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  async function markAllRead() {
    try {
      await api.markAllNotificationsAsRead(ctx);
      setAll((prev) => prev.map((n) => ({ ...n, status: 'read' })));
      void message.success('All marked as read');
    } catch (err) {
      void message.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  const displayed = typeFilter ? all.filter((n) => n.type === typeFilter) : all;
  const unreadCount = all.filter((n) => n.status === 'unread').length;

  return (
    <Flex vertical gap={12}>
      <Flex align="center" justify="space-between" wrap gap={8}>
        <Flex align="center" gap={8}>
          <Select
            placeholder="Filter by type"
            value={typeFilter || undefined}
            onChange={(v) => setTypeFilter(v ?? '')}
            style={{ width: 180 }}
            allowClear
            options={Object.entries(TYPE_META).map(([value, m]) => ({ value, label: m.label }))}
          />
          {unreadCount > 0 && (
            <Badge count={unreadCount} color="blue" />
          )}
        </Flex>
        <Flex gap={8}>
          {unreadCount > 0 && (
            <Button size="small" onClick={() => void markAllRead()}>
              Mark all as read
            </Button>
          )}
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => setReloadToken((n) => n + 1)}
            loading={loading}
          >
            Refresh
          </Button>
        </Flex>
      </Flex>

      <Card variant="borderless" styles={{ body: { padding: 0 } }}>
        {loading && all.length === 0 ? (
          <div style={{ padding: 24 }}>
            <Skeleton active paragraph={{ rows: 5 }} />
          </div>
        ) : displayed.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={typeFilter ? 'No notifications of this type' : 'You\'re all caught up!'}
            style={{ padding: 48 }}
          />
        ) : (
          <List
            dataSource={displayed}
            renderItem={(item) => (
              <NotificationItem key={item.id} notification={item} onRead={(id) => void markRead(id)} />
            )}
          />
        )}
      </Card>
    </Flex>
  );
}

function PreferencesPanel() {
  const { accessToken, currentOrg } = useAuth();
  const { message } = App.useApp();
  const ctx = { accessToken: accessToken ?? '', organizationId: currentOrg?.organizationId ?? '' };

  const [prefs, setPrefs] = useState<NotificationPreferenceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    void api.getNotificationPreferences(ctx)
      .then((data) => setPrefs(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function toggle(key: keyof Pick<NotificationPreferenceDto, 'notifyLeadStale' | 'notifyFollowUpDue' | 'notifyFollowUpOverdue' | 'notifyWeeklyInsight' | 'notifyOpportunityExpiring' | 'notifyLeadResurrection'>, value: boolean) {
    if (!prefs) return;
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaving(true);
    try {
      const result = await api.updateNotificationPreferences(ctx, { [key]: value });
      setPrefs(result);
    } catch (err) {
      setPrefs(prefs);
      void message.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton active paragraph={{ rows: 4 }} />;

  const rows: { key: keyof Pick<NotificationPreferenceDto, 'notifyLeadStale' | 'notifyFollowUpDue' | 'notifyFollowUpOverdue' | 'notifyWeeklyInsight' | 'notifyOpportunityExpiring' | 'notifyLeadResurrection'>; label: string; description: string }[] = [
    { key: 'notifyLeadStale', label: 'Lead gone stale', description: 'Alert when an active lead has had no activity for 7+ days.' },
    { key: 'notifyFollowUpDue', label: 'Follow-up due today', description: 'Alert when a follow-up task is due today.' },
    { key: 'notifyFollowUpOverdue', label: 'Follow-up overdue', description: 'Alert when a follow-up task is past its due date.' },
    { key: 'notifyWeeklyInsight', label: 'Weekly insight digest', description: 'Monday summary of win/loss rate and pipeline activity.' },
    { key: 'notifyOpportunityExpiring', label: 'Opportunity expiring soon', description: 'Alert when an opportunity is within 48 hours of its expiry date.' },
    { key: 'notifyLeadResurrection', label: 'Lead resurrection', description: 'Alert when a dormant lead matches a trending high-demand cluster.' },
  ];

  return (
    <Card variant="borderless">
      <Flex vertical gap={20}>
        {rows.map((row) => (
          <Flex key={row.key} align="flex-start" justify="space-between" gap={16}>
            <Flex vertical gap={2}>
              <Text strong>{row.label}</Text>
              <Text type="secondary" style={{ fontSize: 13 }}>{row.description}</Text>
            </Flex>
            <Switch
              checked={prefs?.[row.key] ?? true}
              loading={saving}
              onChange={(v) => void toggle(row.key, v)}
            />
          </Flex>
        ))}
      </Flex>
    </Card>
  );
}

export default function NotificationsPage() {
  return (
    <Flex vertical gap={24}>
      <PageHeader
        title="Notifications"
        subtitle="Your alerts, follow-up reminders, and weekly insights."
      />
      <Tabs
        items={[
          {
            key: 'feed',
            label: 'Inbox',
            children: <NotificationFeed />,
          },
          {
            key: 'preferences',
            label: 'Preferences',
            children: <PreferencesPanel />,
          },
        ]}
      />
    </Flex>
  );
}
