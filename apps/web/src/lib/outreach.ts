// Outreach & conversations data layer (P6-01). Direct supabase-js access under RLS: reads use the
// `leads.read` SELECT policies; conversation summary + message-template edits use `leads.write`;
// message logging goes through the atomic `record_outreach_message` RPC (create-or-bump the
// conversation thread + insert the message). See supabase/migrations/0039_outreach.sql. All queries
// are org-scoped explicitly *and* by RLS. AI generation/provenance is P6-02; UI is P6-04/P6-05.

import type {
  ConversationSummary,
  MessageTemplate,
  OutreachChannel,
  OutreachDirection,
  OutreachMessage,
  OutreachStatus,
  RecordOutreachMessageInput,
  UpdateConversationSummaryInput,
  UpsertMessageTemplateInput,
} from '@radar/contracts';
import type { LeadStage } from '@radar/contracts';
import { supabase } from './supabase';

// ── row shapes ──────────────────────────────────────────────────────────────────────────────────

interface ConversationRow {
  id: string;
  channel: OutreachChannel;
  summary: string | null;
  lead_id: string | null;
  opportunity_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  last_message_at: string | null;
  created_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string | null;
  channel: OutreachChannel;
  direction: OutreachDirection;
  status: OutreachStatus;
  subject: string | null;
  body: string;
  is_ai_generated: boolean;
  ai_request_id: string | null;
  message_template_id: string | null;
  lead_id: string | null;
  opportunity_id: string | null;
  contact_id: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  created_by: string | null;
  created_at: string;
}

interface TemplateRow {
  id: string;
  name: string;
  channel: OutreachChannel;
  service: string | null;
  stage: LeadStage | null;
  subject_template: string | null;
  body_template: string;
  tone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CONVERSATION_COLS =
  'id, channel, summary, lead_id, opportunity_id, company_id, contact_id, last_message_at, created_at';
const MESSAGE_COLS =
  'id, conversation_id, channel, direction, status, subject, body, is_ai_generated, ai_request_id, message_template_id, lead_id, opportunity_id, contact_id, sent_at, opened_at, replied_at, created_by, created_at';
const TEMPLATE_COLS =
  'id, name, channel, service, stage, subject_template, body_template, tone, is_active, created_at, updated_at';

function toConversation(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    channel: row.channel,
    summary: row.summary,
    leadId: row.lead_id,
    opportunityId: row.opportunity_id,
    companyId: row.company_id,
    contactId: row.contact_id,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

function toMessage(row: MessageRow): OutreachMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    channel: row.channel,
    direction: row.direction,
    status: row.status,
    subject: row.subject,
    body: row.body,
    isAiGenerated: row.is_ai_generated,
    aiRequestId: row.ai_request_id,
    messageTemplateId: row.message_template_id,
    leadId: row.lead_id,
    opportunityId: row.opportunity_id,
    contactId: row.contact_id,
    sentAt: row.sent_at,
    openedAt: row.opened_at,
    repliedAt: row.replied_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toTemplate(row: TemplateRow): MessageTemplate {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    service: row.service,
    stage: row.stage,
    subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template,
    tone: row.tone,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── conversations ─────────────────────────────────────────────────────────────────────────────

export async function listConversations(
  organizationId: string,
  filter: { leadId?: string; opportunityId?: string } = {},
): Promise<ConversationSummary[]> {
  let q = supabase
    .from('conversations')
    .select(CONVERSATION_COLS)
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (filter.leadId) q = q.eq('lead_id', filter.leadId);
  if (filter.opportunityId) q = q.eq('opportunity_id', filter.opportunityId);

  const { data, error } = await q.order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as unknown as ConversationRow[]).map(toConversation);
}

export async function updateConversationSummary(
  organizationId: string,
  input: UpdateConversationSummaryInput,
): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ summary: input.summary })
    .eq('organization_id', organizationId)
    .eq('id', input.conversationId);
  if (error) throw error;
}

// ── messages ────────────────────────────────────────────────────────────────────────────────────

/** Thread history. Pass a conversation to load its thread, or a lead to load all of its messages. */
export async function listMessages(
  organizationId: string,
  filter: { conversationId?: string; leadId?: string; opportunityId?: string },
): Promise<OutreachMessage[]> {
  let q = supabase
    .from('outreach_messages')
    .select(MESSAGE_COLS)
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (filter.conversationId) q = q.eq('conversation_id', filter.conversationId);
  if (filter.leadId) q = q.eq('lead_id', filter.leadId);
  if (filter.opportunityId) q = q.eq('opportunity_id', filter.opportunityId);

  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as MessageRow[]).map(toMessage);
}

/** Log an outreach message, atomically creating or bumping its conversation thread. */
export async function recordMessage(input: RecordOutreachMessageInput): Promise<OutreachMessage> {
  const { data, error } = await supabase.rpc('record_outreach_message', {
    p_channel: input.channel,
    p_direction: input.direction,
    p_body: input.body,
    p_lead: input.leadId ?? null,
    p_opportunity: input.opportunityId ?? null,
    p_contact: input.contactId ?? null,
    p_conversation: input.conversationId ?? null,
    p_subject: input.subject ?? null,
    p_status: input.status,
    p_is_ai_generated: input.isAiGenerated,
    p_ai_request_id: input.aiRequestId ?? null,
    p_message_template_id: input.messageTemplateId ?? null,
  });
  if (error) throw error;
  return toMessage(data as unknown as MessageRow);
}

// ── message templates ────────────────────────────────────────────────────────────────────────────

export async function listMessageTemplates(
  organizationId: string,
  filter: { activeOnly?: boolean } = {},
): Promise<MessageTemplate[]> {
  let q = supabase
    .from('message_templates')
    .select(TEMPLATE_COLS)
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (filter.activeOnly) q = q.eq('is_active', true);

  const { data, error } = await q.order('name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as TemplateRow[]).map(toTemplate);
}

export async function upsertMessageTemplate(
  organizationId: string,
  input: UpsertMessageTemplateInput,
): Promise<MessageTemplate> {
  const row = {
    organization_id: organizationId,
    name: input.name,
    channel: input.channel,
    service: input.service ?? null,
    stage: input.stage ?? null,
    subject_template: input.subjectTemplate ?? null,
    body_template: input.bodyTemplate,
    tone: input.tone ?? null,
    is_active: input.isActive,
  };

  const query = input.id
    ? supabase.from('message_templates').update(row).eq('organization_id', organizationId).eq('id', input.id)
    : supabase.from('message_templates').insert(row);

  const { data, error } = await query.select(TEMPLATE_COLS).single();
  if (error) throw error;
  return toTemplate(data as unknown as TemplateRow);
}

export async function deleteMessageTemplate(organizationId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('message_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', id);
  if (error) throw error;
}
