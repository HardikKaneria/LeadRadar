export interface NotificationPreferenceDto {
  userId: string;
  organizationId: string;
  notifyLeadStale: boolean;
  notifyFollowUpDue: boolean;
  notifyFollowUpOverdue: boolean;
  notifyWeeklyInsight: boolean;
  notifyOpportunityExpiring: boolean;
  notifyLeadResurrection: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType = 'lead_stale' | 'follow_up_due' | 'follow_up_overdue' | 'general' | 'weekly_insight' | 'opportunity_expiring' | 'lead_resurrection';
export type NotificationStatus = 'unread' | 'read';

export interface NotificationDto {
  id: string;
  organizationId: string;
  userId: string;
  type: NotificationType;
  status: NotificationStatus;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationUpdateDto {
  status: NotificationStatus;
}

export interface NotificationPreferenceUpdateDto {
  notifyLeadStale?: boolean;
  notifyFollowUpDue?: boolean;
  notifyFollowUpOverdue?: boolean;
  notifyWeeklyInsight?: boolean;
  notifyOpportunityExpiring?: boolean;
  notifyLeadResurrection?: boolean;
}
