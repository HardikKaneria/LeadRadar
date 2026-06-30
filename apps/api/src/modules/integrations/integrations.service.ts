import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type { ServiceClient } from '@radar/supabase';
import type { IntegrationAccountDto, ConnectIntegrationDto } from '@radar/contracts';

@Injectable()
export class IntegrationsService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async getIntegrations(organizationId: string): Promise<IntegrationAccountDto[]> {
    const { data, error } = await this.supabase
      .from('integration_accounts')
      .select('id, organization_id, provider, type, status, settings, connected_by, connected_at, last_checked_at, created_at, updated_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data.map((d: any) => ({
      id: d.id,
      organizationId: d.organization_id,
      provider: d.provider,
      type: d.type,
      status: d.status,
      settings: d.settings,
      connectedBy: d.connected_by,
      connectedAt: d.connected_at,
      lastCheckedAt: d.last_checked_at,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
  }

  async connectIntegration(
    organizationId: string,
    userId: string,
    dto: ConnectIntegrationDto,
  ): Promise<IntegrationAccountDto> {
    const { provider, type, credentials, settings } = dto;

    // Ideally credentials would be encrypted using a KMS here.
    // We store them as JSONB for now since KMS is out of scope.
    const { data, error } = await this.supabase
      .from('integration_accounts')
      .upsert(
        {
          organization_id: organizationId,
          provider,
          type,
          status: 'connected',
          encrypted_credentials: credentials,
          settings,
          connected_by: userId,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id, provider, type' }
      )
      .select('id, organization_id, provider, type, status, settings, connected_by, connected_at, last_checked_at, created_at, updated_at')
      .single();

    if (error) {
      throw new BadRequestException(`Failed to connect integration: ${error.message}`);
    }

    return {
      id: data.id,
      organizationId: data.organization_id,
      provider: data.provider,
      type: data.type,
      status: data.status,
      settings: data.settings,
      connectedBy: data.connected_by,
      connectedAt: data.connected_at,
      lastCheckedAt: data.last_checked_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async disconnectIntegration(organizationId: string, id: string): Promise<void> {
    const { error } = await this.supabase
      .from('integration_accounts')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      throw new BadRequestException(`Failed to disconnect integration: ${error.message}`);
    }
  }
}
