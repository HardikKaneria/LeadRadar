import { Inject, Injectable } from '@nestjs/common';
import {
  generateProposal,
  type AiCallContext,
  type AiCallRecord,
  type ProposalDraft,
  type ProposalInput,
} from '@radar/ai';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AiProviderPoolService } from './ai-provider-pool.service';

type ProposalRow = Database['public']['Tables']['proposals']['Row'];
type LeadRow = Database['public']['Tables']['leads']['Row'];
type OpportunityRow = Database['public']['Tables']['opportunities']['Row'];

/**
 * Proposal Generator writer (P6-03). Loads a lead/opportunity plus workspace context (company name,
 * contact name, Company Brain services/tone), runs the pure `@radar/ai` proposal agent through the
 * governed gateway, and persists the result to `proposals` (status `ready`, `content` = structured
 * ProposalDraft JSON). Mirrors the company-research / analyzer patterns.
 */
@Injectable()
export class ProposalService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly pool: AiProviderPoolService,
  ) {}

  async generateProposal(
    organizationId: string,
    entityType: 'lead' | 'opportunity',
    entityId: string,
    userId: string,
  ): Promise<ProposalRow> {
    const input = await this.buildInput(organizationId, entityType, entityId);

    let lastCall: AiCallRecord | undefined;
    const ai = await this.pool.buildService({
      organizationId,
      hooks: {
        onCall: (record) => {
          if (record.status !== 'error') lastCall = record;
        },
      },
    });

    const ctx: AiCallContext = { taskType: 'proposal_generator', organizationId, userId };
    const draft = await generateProposal(ai, ctx, input);

    return this.persist(organizationId, entityType, entityId, draft, userId, lastCall);
  }

  private async persist(
    organizationId: string,
    entityType: 'lead' | 'opportunity',
    entityId: string,
    draft: ProposalDraft,
    userId: string,
    lastCall: AiCallRecord | undefined,
  ): Promise<ProposalRow> {
    const content: Json = {
      title: draft.title,
      summary: draft.summary,
      sections: draft.sections as unknown as Json,
      pricingNote: draft.pricingNote,
      generatedAt: new Date().toISOString(),
      aiPromptVersionId: lastCall?.aiPromptVersionId ?? null,
      model: lastCall ? { provider: lastCall.provider as string, model: lastCall.model } : null,
    };

    const { data, error } = await this.supabase
      .from('proposals')
      .insert({
        organization_id: organizationId,
        lead_id: entityType === 'lead' ? entityId : null,
        opportunity_id: entityType === 'opportunity' ? entityId : null,
        title: draft.title,
        status: 'ready',
        content,
        created_by: userId,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to persist proposal: ${error?.message ?? 'unknown error'}`);
    }
    return data as ProposalRow;
  }

  private async buildInput(
    organizationId: string,
    entityType: 'lead' | 'opportunity',
    entityId: string,
  ): Promise<ProposalInput> {
    const [entity, brain] = await Promise.all([
      entityType === 'lead'
        ? this.loadLead(organizationId, entityId)
        : this.loadOpportunity(organizationId, entityId),
      this.loadBrain(organizationId),
    ]);

    if (entityType === 'lead') {
      const lead = entity as LeadRow;
      const [companyName, contactName] = await this.resolveNames(
        organizationId,
        lead.company_id,
        lead.primary_contact_id,
      );
      return {
        entityTitle: lead.title,
        entityKind: 'lead',
        companyName,
        contactName,
        services: brain.services,
        tone: brain.tone,
        value: lead.value ? Number(lead.value) : null,
        currency: lead.currency,
      };
    }

    const opp = entity as OpportunityRow;
    const [companyName, contactName] = await this.resolveNames(
      organizationId,
      opp.company_id,
      opp.primary_contact_id,
    );
    return {
      entityTitle: opp.title,
      entityKind: 'opportunity',
      companyName,
      contactName,
      services: brain.services,
      tone: brain.tone,
      value: opp.potential_value ? Number(opp.potential_value) : null,
      context: opp.recommended_action ?? opp.ai_explanation ?? null,
    };
  }

  private async loadLead(organizationId: string, leadId: string): Promise<LeadRow> {
    const { data, error } = await this.supabase
      .from('leads')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', leadId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) throw new Error(`Lead ${leadId} not found`);
    return data as LeadRow;
  }

  private async loadOpportunity(organizationId: string, opportunityId: string): Promise<OpportunityRow> {
    const { data, error } = await this.supabase
      .from('opportunities')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', opportunityId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !data) throw new Error(`Opportunity ${opportunityId} not found`);
    return data as OpportunityRow;
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

  private async loadBrain(organizationId: string): Promise<{ services: string[]; tone: string | null }> {
    const { data } = await this.supabase
      .from('company_profiles')
      .select('services, outreach_tone')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();
    return {
      services: (data as { services?: string[] } | null)?.services ?? [],
      tone: (data as { outreach_tone?: string | null } | null)?.outreach_tone ?? null,
    };
  }
}
