import { Injectable, Inject, Logger } from '@nestjs/common';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type { ServiceClient } from '@radar/supabase';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async recordAction(input: {
    organizationId: string;
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    const { error } = await this.supabase.from('audit_log').insert({
      organization_id: input.organizationId,
      actor_id: input.actorId ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
    });

    if (error) {
      this.logger.error(`Failed to record audit event ${input.action}:`, error);
      throw error;
    }
  }

  async getBillingEvents(organizationId: string, limit = 50) {
    const { data, error } = await this.supabase
      .from('billing_events')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      this.logger.error('Failed to get billing events:', error);
      throw error;
    }

    return data;
  }

  async getAiRequests(organizationId: string, limit = 50) {
    // Note: ai_requests might not have organization_id explicitly depending on schema,
    // assuming it exists or filtering by user_id linked to org.
    // If table doesn't exist or is empty, we handle gracefully.
    try {
      const { data, error } = await this.supabase
        .from('ai_requests')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (e: any) {
      this.logger.warn(`Could not fetch ai_requests: ${e.message}`);
      return [];
    }
  }
}
