import { Inject, Injectable } from '@nestjs/common';
import {
  draftFollowUpMessage,
  draftSalesMessage,
  prepareMeeting,
  suggestNextAction,
  summarizeConversation,
  type AiCallContext,
  type AssistantEntityContext,
  type AssistantMessageContext,
  type MeetingPrep,
  type NextActionSuggestion,
  type SalesAssistantContext,
} from '@radar/ai';
import type {
  AssistantEntityType,
  AssistantMessageKind,
  OutreachChannel,
} from '@radar/contracts';
import type { Database, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AiProviderPoolService } from './ai-provider-pool.service';

type OutreachMessageRow = Database['public']['Tables']['outreach_messages']['Row'];
type ConversationRow = Database['public']['Tables']['conversations']['Row'];

const MAX_RECENT_MESSAGES = 12;

export interface DraftMessageRequest {
  entityType: AssistantEntityType;
  entityId: string;
  kind: AssistantMessageKind;
  channel: OutreachChannel;
  instruction?: string;
  conversationId?: string;
}

/**
 * AI Sales Assistant writer (P6-02). Loads an entity (lead/opportunity) + its recent outreach and the
 * Company Brain tone, runs the pure `@radar/ai` assistant through the governed gateway, and persists
 * the result: drafted messages land in `outreach_messages` (status `draft`, `is_ai_generated`),
 * conversation summaries update `conversations.summary`; meeting-prep / next-action are advisory and
 * returned, not stored. Uses the service-role client (auth is enforced by the controller permission),
 * so it threads conversations in code rather than through the user-bound `record_outreach_message` RPC.
 */
@Injectable()
export class SalesAssistantService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly pool: AiProviderPoolService,
  ) {}

  async draftMessage(organizationId: string, userId: string, req: DraftMessageRequest): Promise<OutreachMessageRow> {
    const entity = await this.loadEntity(organizationId, req.entityType, req.entityId);
    const sac = await this.buildContext(organizationId, req.entityType, req.entityId, entity, req.channel, req.instruction);

    const taskType = req.kind;
    const ai = await this.pool.buildService({ organizationId });
    const ctx: AiCallContext = { taskType, organizationId, userId };
    const drafted =
      req.kind === 'follow_up_message'
        ? await draftFollowUpMessage(ai, ctx, sac)
        : await draftSalesMessage(ai, ctx, sac);

    const conversationId = await this.resolveConversation(
      organizationId,
      req.channel,
      req.entityType,
      req.entityId,
      req.conversationId,
    );

    const { data, error } = await this.supabase
      .from('outreach_messages')
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        lead_id: req.entityType === 'lead' ? req.entityId : null,
        opportunity_id: req.entityType === 'opportunity' ? req.entityId : null,
        channel: req.channel,
        direction: 'outbound',
        status: 'draft',
        subject: drafted.subject,
        body: drafted.body,
        is_ai_generated: true,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to persist drafted message: ${error?.message ?? 'unknown error'}`);
    }

    await this.supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('organization_id', organizationId);

    return data as OutreachMessageRow;
  }

  async summarizeConversation(organizationId: string, userId: string, conversationId: string): Promise<string> {
    const conversation = await this.loadConversation(organizationId, conversationId);
    const entity = conversation.lead_id
      ? await this.loadEntity(organizationId, 'lead', conversation.lead_id)
      : conversation.opportunity_id
        ? await this.loadEntity(organizationId, 'opportunity', conversation.opportunity_id)
        : { kind: 'lead' as const, title: 'Conversation' };

    const recentMessages = await this.loadMessages(organizationId, { conversationId });
    const tone = await this.loadTone(organizationId);
    const sac: SalesAssistantContext = {
      entity,
      channel: conversation.channel,
      tone,
      recentMessages,
    };

    const ai = await this.pool.buildService({ organizationId });
    const ctx: AiCallContext = { taskType: 'conversation_summary', organizationId, userId };
    const { summary } = await summarizeConversation(ai, ctx, sac);

    const { error } = await this.supabase
      .from('conversations')
      .update({ summary })
      .eq('id', conversationId)
      .eq('organization_id', organizationId);
    if (error) {
      throw new Error(`Failed to persist conversation summary: ${error.message}`);
    }
    return summary;
  }

  async prepareMeeting(
    organizationId: string,
    userId: string,
    entityType: AssistantEntityType,
    entityId: string,
  ): Promise<MeetingPrep> {
    const entity = await this.loadEntity(organizationId, entityType, entityId);
    const sac = await this.buildContext(organizationId, entityType, entityId, entity, 'meeting');
    const ai = await this.pool.buildService({ organizationId });
    const ctx: AiCallContext = { taskType: 'meeting_prep', organizationId, userId };
    return prepareMeeting(ai, ctx, sac);
  }

  async suggestNextAction(
    organizationId: string,
    userId: string,
    entityType: AssistantEntityType,
    entityId: string,
  ): Promise<NextActionSuggestion> {
    const entity = await this.loadEntity(organizationId, entityType, entityId);
    const sac = await this.buildContext(organizationId, entityType, entityId, entity, 'other');
    const ai = await this.pool.buildService({ organizationId });
    const ctx: AiCallContext = { taskType: 'next_action', organizationId, userId };
    return suggestNextAction(ai, ctx, sac);
  }

  // ── context loading ─────────────────────────────────────────────────────────────────────────

  private async buildContext(
    organizationId: string,
    entityType: AssistantEntityType,
    entityId: string,
    entity: AssistantEntityContext,
    channel: OutreachChannel | 'meeting' | 'other',
    instruction?: string,
  ): Promise<SalesAssistantContext> {
    const [recentMessages, tone] = await Promise.all([
      this.loadMessages(
        organizationId,
        entityType === 'lead' ? { leadId: entityId } : { opportunityId: entityId },
      ),
      this.loadTone(organizationId),
    ]);
    return { entity, channel, tone, recentMessages, instruction: instruction ?? null };
  }

  private async loadEntity(
    organizationId: string,
    entityType: AssistantEntityType,
    entityId: string,
  ): Promise<AssistantEntityContext> {
    if (entityType === 'lead') {
      const { data, error } = await this.supabase
        .from('leads')
        .select('title, stage, value, company_id, primary_contact_id')
        .eq('organization_id', organizationId)
        .eq('id', entityId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error || !data) throw new Error(`Lead ${entityId} not found`);
      const [companyName, contactName] = await this.resolveNames(organizationId, data.company_id, data.primary_contact_id);
      return {
        kind: 'lead',
        title: data.title,
        companyName,
        contactName,
        stage: data.stage,
        value: data.value,
      };
    }

    const { data, error } = await this.supabase
      .from('opportunities')
      .select('title, status, potential_value, recommended_action, ai_explanation, company_id, primary_contact_id')
      .eq('organization_id', organizationId)
      .eq('id', entityId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) throw new Error(`Opportunity ${entityId} not found`);
    const [companyName, contactName] = await this.resolveNames(organizationId, data.company_id, data.primary_contact_id);
    return {
      kind: 'opportunity',
      title: data.title,
      companyName,
      contactName,
      stage: data.status,
      value: data.potential_value,
      recommendedAction: data.recommended_action,
      notes: data.ai_explanation,
    };
  }

  private async resolveNames(
    organizationId: string,
    companyId: string | null,
    contactId: string | null,
  ): Promise<[string | null, string | null]> {
    const [company, contact] = await Promise.all([
      companyId
        ? this.supabase.from('companies').select('name').eq('organization_id', organizationId).eq('id', companyId).maybeSingle()
        : Promise.resolve({ data: null }),
      contactId
        ? this.supabase.from('contacts').select('name').eq('organization_id', organizationId).eq('id', contactId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return [company.data?.name ?? null, contact.data?.name ?? null];
  }

  private async loadMessages(
    organizationId: string,
    filter: { conversationId?: string; leadId?: string; opportunityId?: string },
  ): Promise<AssistantMessageContext[]> {
    let q = this.supabase
      .from('outreach_messages')
      .select('direction, body, created_at')
      .eq('organization_id', organizationId)
      .is('deleted_at', null);
    if (filter.conversationId) q = q.eq('conversation_id', filter.conversationId);
    if (filter.leadId) q = q.eq('lead_id', filter.leadId);
    if (filter.opportunityId) q = q.eq('opportunity_id', filter.opportunityId);

    const { data, error } = await q.order('created_at', { ascending: true }).limit(MAX_RECENT_MESSAGES);
    if (error || !data) return [];
    return data.map((row) => ({
      direction: row.direction as AssistantMessageContext['direction'],
      body: row.body,
    }));
  }

  /** Best-effort Company Brain outreach tone; null if unset or unreadable. */
  private async loadTone(organizationId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('company_profiles')
      .select('outreach_tone')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();
    return data?.outreach_tone ?? null;
  }

  private async loadConversation(organizationId: string, conversationId: string): Promise<ConversationRow> {
    const { data, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', conversationId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) throw new Error(`Conversation ${conversationId} not found`);
    return data as ConversationRow;
  }

  /** Reuse the most recent open conversation for (org, channel, entity) or create one. */
  private async resolveConversation(
    organizationId: string,
    channel: OutreachChannel,
    entityType: AssistantEntityType,
    entityId: string,
    explicitId?: string,
  ): Promise<string> {
    if (explicitId) return explicitId;

    const column = entityType === 'lead' ? 'lead_id' : 'opportunity_id';
    const { data: existing } = await this.supabase
      .from('conversations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('channel', channel)
      .eq(column, entityId)
      .is('deleted_at', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) return existing.id;

    const { data, error } = await this.supabase
      .from('conversations')
      .insert({
        organization_id: organizationId,
        channel,
        lead_id: entityType === 'lead' ? entityId : null,
        opportunity_id: entityType === 'opportunity' ? entityId : null,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`Failed to create conversation: ${error?.message ?? 'unknown error'}`);
    return data.id;
  }
}
