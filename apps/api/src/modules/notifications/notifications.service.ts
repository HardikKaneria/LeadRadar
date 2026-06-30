import { Injectable, Inject } from '@nestjs/common';
import type { ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import {
  NotificationDto,
  NotificationPreferenceDto,
  NotificationUpdateDto,
  NotificationPreferenceUpdateDto,
} from '@radar/contracts';

@Injectable()
export class NotificationsService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async listNotifications(userId: string): Promise<NotificationDto[]> {
    const { data, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    
    return (data || []).map((d: any) => ({
      id: d.id,
      organizationId: d.organization_id,
      userId: d.user_id,
      type: d.type,
      status: d.status,
      data: d.data || {},
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
  }

  async markAsRead(userId: string, notificationId: string, update: NotificationUpdateDto): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ status: update.status, updated_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async markAllAsRead(userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .update({ status: 'read', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'unread');

    if (error) throw error;
  }

  async getPreferences(userId: string, organizationId: string): Promise<NotificationPreferenceDto> {
    const { data, error } = await this.supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error; // Not found is fine, we return defaults below.
    }

    if (data) {
      return {
        userId: data.user_id,
        organizationId: data.organization_id,
        notifyLeadStale: data.notify_lead_stale,
        notifyFollowUpDue: data.notify_follow_up_due,
        notifyFollowUpOverdue: data.notify_follow_up_overdue,
        notifyWeeklyInsight: data.notify_weekly_insight,
        notifyOpportunityExpiring: data.notify_opportunity_expiring ?? true,
        notifyLeadResurrection: data.notify_lead_resurrection ?? true,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }

    // Default preferences if not found
    return {
      userId,
      organizationId,
      notifyLeadStale: true,
      notifyFollowUpDue: true,
      notifyFollowUpOverdue: true,
      notifyWeeklyInsight: true,
      notifyOpportunityExpiring: true,
      notifyLeadResurrection: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async updatePreferences(
    userId: string,
    organizationId: string,
    update: NotificationPreferenceUpdateDto
  ): Promise<NotificationPreferenceDto> {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (update.notifyLeadStale !== undefined) payload['notify_lead_stale'] = update.notifyLeadStale;
    if (update.notifyFollowUpDue !== undefined) payload['notify_follow_up_due'] = update.notifyFollowUpDue;
    if (update.notifyFollowUpOverdue !== undefined) payload['notify_follow_up_overdue'] = update.notifyFollowUpOverdue;
    if (update.notifyWeeklyInsight !== undefined) payload['notify_weekly_insight'] = update.notifyWeeklyInsight;
    if (update.notifyOpportunityExpiring !== undefined) payload['notify_opportunity_expiring'] = update.notifyOpportunityExpiring;
    if (update.notifyLeadResurrection !== undefined) payload['notify_lead_resurrection'] = update.notifyLeadResurrection;
    const { data, error } = await this.supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        organization_id: organizationId,
        ...payload,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      userId: data.user_id,
      organizationId: data.organization_id,
      notifyLeadStale: data.notify_lead_stale,
      notifyFollowUpDue: data.notify_follow_up_due,
      notifyFollowUpOverdue: data.notify_follow_up_overdue,
      notifyWeeklyInsight: data.notify_weekly_insight,
      notifyOpportunityExpiring: data.notify_opportunity_expiring,
      notifyLeadResurrection: data.notify_lead_resurrection,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}
