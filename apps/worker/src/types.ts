export type LeadStatus =
  | "new"
  | "interested"
  | "applied"
  | "follow_up"
  | "won"
  | "lost"
  | "ignored";

export type Lead = {
  id: string;
  platform: string;
  external_id?: string | null;
  title: string;
  description?: string | null;
  url: string;
  budget_text?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  currency?: string | null;
  posted_at?: string | null;
  first_seen_at?: string | null;
  score: number;
  score_reason?: string | null;
  matched_keywords?: string[] | null;
  status: LeadStatus;
  notified_at?: string | null;
  notification_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BrevoSendEmailInput = {
  to: Array<{
    email: string;
    name?: string;
  }>;
  subject: string;
  htmlContent: string;
  textContent?: string;
  tags?: string[];
};

export type BrevoSendEmailResult = {
  messageId?: string;
  messageIds?: string[];
};