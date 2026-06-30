'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Dropdown, MenuProps, Typography, List, Button, message, Space } from 'antd';
import { BellOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined, LineChartOutlined } from '@ant-design/icons';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { NotificationDto } from '@radar/contracts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;

export function NotificationBell() {
  const { session, currentOrg } = useAuth();
  const ctx = { accessToken: session?.access_token ?? '', organizationId: currentOrg?.organizationId ?? '' };
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchNotifications = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const data = await api.listNotifications(ctx);
      setNotifications(data);
    } catch (err: any) {
      console.error('Failed to load notifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    
    // Poll every 5 minutes
    const interval = setInterval(() => {
      fetchNotifications();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [session]);

  const markAsRead = async (id: string) => {
    if (!session) return;
    try {
      await api.updateNotification(ctx, id, { status: 'read' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'read' } : n)));
    } catch (err: any) {
      message.error('Failed to update notification');
    }
  };

  const markAllAsRead = async () => {
    if (!session) return;
    try {
      await api.markAllNotificationsAsRead(ctx);
      setNotifications((prev) => prev.map((n) => ({ ...n, status: 'read' })));
      message.success('All marked as read');
    } catch (err: any) {
      message.error('Failed to update notifications');
    }
  };

  const unreadCount = notifications.filter((n) => n.status === 'unread').length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'lead_stale':
        return <ClockCircleOutlined style={{ color: '#faad14' }} />;
      case 'follow_up_overdue':
        return <WarningOutlined style={{ color: '#ff4d4f' }} />;
      case 'follow_up_due':
        return <CheckCircleOutlined style={{ color: '#1890ff' }} />;
      case 'weekly_insight':
        return <LineChartOutlined style={{ color: '#722ed1' }} />;
      default:
        return <BellOutlined />;
    }
  };

  const overlay = (
    <div style={{ width: 350, background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: 8, padding: '12px 0' }}>
      <div style={{ padding: '0 16px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>Notifications</Text>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        )}
      </div>
      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {loading && notifications.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center' }}><Text type="secondary">Loading...</Text></div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center' }}><Text type="secondary">No notifications</Text></div>
        ) : (
          <List
            itemLayout="horizontal"
            dataSource={notifications}
            renderItem={(item) => (
              <List.Item
                style={{ 
                  padding: '12px 16px', 
                  background: item.status === 'unread' ? '#e6f4ff' : 'transparent',
                  cursor: item.status === 'unread' ? 'pointer' : 'default',
                  borderBottom: '1px solid #f0f0f0'
                }}
                onClick={() => {
                  if (item.status === 'unread') markAsRead(item.id);
                }}
              >
                <List.Item.Meta
                  avatar={<div style={{ fontSize: 20 }}>{getIcon(item.type)}</div>}
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text strong={item.status === 'unread'}>
                        {item.type === 'weekly_insight'
                          ? `Weekly Insight: ${item.data?.winRate ?? 0}% win rate (${item.data?.wonLeads ?? 0} won, ${item.data?.lostLeads ?? 0} lost)`
                          : item.data?.message || item.type}
                      </Text>
                    </div>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {dayjs(item.createdAt).fromNow()}
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );

  return (
    <Dropdown 
      dropdownRender={() => overlay} 
      trigger={['click']} 
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Badge count={unreadCount} size="small">
        <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} />
      </Badge>
    </Dropdown>
  );
}
