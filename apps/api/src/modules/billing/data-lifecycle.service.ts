import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type { ServiceClient } from '@radar/supabase';

@Injectable()
export class DataLifecycleService {
  private readonly logger = new Logger(DataLifecycleService.name);

  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  /**
   * Fetches all core organizational data and packages it into a single JSON object.
   */
  async exportOrganizationData(organizationId: string) {
    this.logger.log(`Exporting data for org ${organizationId}`);

    const [leads, opps, discoveries, knowledge] = await Promise.all([
      this.supabase.from('leads').select('*').eq('organization_id', organizationId),
      this.supabase.from('opportunities').select('*').eq('organization_id', organizationId),
      this.supabase.from('discoveries').select('*').eq('organization_id', organizationId),
      this.supabase.from('knowledge_events').select('*').eq('organization_id', organizationId),
    ]);

    if (leads.error) throw leads.error;
    if (opps.error) throw opps.error;
    if (discoveries.error) throw discoveries.error;
    if (knowledge.error) throw knowledge.error;

    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        organizationId,
      },
      data: {
        leads: leads.data,
        opportunities: opps.data,
        discoveries: discoveries.data,
        knowledge: knowledge.data,
      }
    };
  }

  /**
   * Permanently deletes an organization and all its cascade-able data.
   */
  async deleteOrganization(organizationId: string) {
    this.logger.warn(`Permanently deleting org ${organizationId}`);

    const { error } = await this.supabase.rpc('hard_delete_organization', {
      org_id: organizationId
    });

    if (error) {
      this.logger.error(`Failed to delete org ${organizationId}`, error);
      throw new BadRequestException('Failed to delete organization');
    }

    return { success: true };
  }
}
