import { Inject, Injectable } from '@nestjs/common';
import {
  AI_PRIVACY_MODES,
  AI_SETTINGS_PROVIDER_NAMES,
  type AiPrivacyMode,
  type AiPrivacyModeResponse,
  type AiProviderSettingsResponse,
  type AiProviderSettingsSummary,
  type AiProviderSettingsUpdateInput,
  type AiSettingsProviderName,
} from '@radar/contracts';
import { encryptSecret, type AppConfig, ValidationError } from '@radar/core';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { APP_CONFIG } from '../../config/app-config.module';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

type IntegrationAccountRow = Database['public']['Tables']['integration_accounts']['Row'];
type IntegrationAccountInsert = Database['public']['Tables']['integration_accounts']['Insert'];
type OrganizationRow = Database['public']['Tables']['organizations']['Row'];

const DEFAULT_PRIVACY_MODE: AiPrivacyMode = 'redact_pii_before_ai';
const DEFAULT_PROVIDER_PRIORITY: Record<AiSettingsProviderName, number> = {
  gemini: 1,
  groq: 2,
  openrouter: 3,
};

function defaultProviderPriority(provider: AiSettingsProviderName): number {
  return DEFAULT_PROVIDER_PRIORITY[provider] ?? 1;
}

export interface OrganizationAiRuntimeProvider {
  provider: AiSettingsProviderName;
  enabled: boolean;
  priority: number;
  status: IntegrationAccountRow['status'];
  encryptedApiKey: string | null;
  connectedAt: string | null;
  lastCheckedAt: string | null;
  connectedByUserId: string | null;
}

export interface OrganizationAiRuntimePolicy {
  privacyMode: AiPrivacyMode;
  providers: Partial<Record<AiSettingsProviderName, OrganizationAiRuntimeProvider>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAiPrivacyMode(value: unknown): value is AiPrivacyMode {
  return typeof value === 'string' && AI_PRIVACY_MODES.includes(value as AiPrivacyMode);
}

function providerPriority(provider: AiSettingsProviderName, settings: Json): number {
  if (!isRecord(settings) || typeof settings.priority !== 'number' || !Number.isFinite(settings.priority)) {
    return defaultProviderPriority(provider);
  }
  return Math.max(1, Math.min(99, Math.trunc(settings.priority)));
}

function providerEnabled(settings: Json): boolean {
  return isRecord(settings) && settings.enabled === true;
}

function encryptedApiKey(credentials: Json): string | null {
  return isRecord(credentials) && typeof credentials.apiKey === 'string' && credentials.apiKey.length > 0
    ? credentials.apiKey
    : null;
}

function summaryFromRow(
  provider: AiSettingsProviderName,
  row: IntegrationAccountRow | null,
): AiProviderSettingsSummary {
  return {
    provider,
    enabled: row ? providerEnabled(row.settings) : false,
    priority: row ? providerPriority(provider, row.settings) : defaultProviderPriority(provider),
    status: row?.status ?? 'disconnected',
    hasStoredKey: row ? encryptedApiKey(row.encrypted_credentials) != null : false,
    connectedAt: row?.connected_at ?? null,
    lastCheckedAt: row?.last_checked_at ?? null,
    connectedByUserId: row?.connected_by ?? null,
  };
}

function summaryFromRuntimeProvider(
  provider: AiSettingsProviderName,
  runtimeProvider: OrganizationAiRuntimeProvider | null,
): AiProviderSettingsSummary {
  return {
    provider,
    enabled: runtimeProvider?.enabled ?? false,
    priority: runtimeProvider?.priority ?? defaultProviderPriority(provider),
    status: runtimeProvider?.status ?? 'disconnected',
    hasStoredKey: runtimeProvider?.encryptedApiKey != null,
    connectedAt: runtimeProvider?.connectedAt ?? null,
    lastCheckedAt: runtimeProvider?.lastCheckedAt ?? null,
    connectedByUserId: runtimeProvider?.connectedByUserId ?? null,
  };
}

@Injectable()
export class AiSettingsService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listProviderSettings(organizationId: string): Promise<AiProviderSettingsResponse> {
    const policy = await this.getRuntimePolicy(organizationId);

    return {
      privacyMode: policy.privacyMode,
      providers: AI_SETTINGS_PROVIDER_NAMES.map((provider) =>
        summaryFromRuntimeProvider(provider, policy.providers[provider] ?? null),
      ),
    };
  }

  async getPrivacyMode(organizationId: string): Promise<AiPrivacyModeResponse> {
    const organization = await this.loadOrganization(organizationId);
    return { privacyMode: this.privacyModeFromSettings(organization.settings) };
  }

  /** Returns just the AiPrivacyMode string — used by AiProviderPoolService.buildService. */
  async getOrgPrivacyMode(organizationId: string): Promise<AiPrivacyMode> {
    const organization = await this.loadOrganization(organizationId);
    return this.privacyModeFromSettings(organization.settings);
  }

  async updatePrivacyMode(
    organizationId: string,
    privacyMode: AiPrivacyMode,
  ): Promise<AiPrivacyModeResponse> {
    const organization = await this.loadOrganization(organizationId);
    const currentSettings = isRecord(organization.settings) ? organization.settings : {};
    const nextSettings = {
      ...currentSettings,
      privacy_mode: privacyMode,
    };

    const { error } = await this.supabase
      .from('organizations')
      .update({ settings: nextSettings as Json })
      .eq('id', organizationId);

    if (error) {
      throw new Error(`Failed to update AI privacy mode: ${error.message}`);
    }

    return { privacyMode };
  }

  async updateProviderSetting(
    organizationId: string,
    userId: string,
    provider: string,
    input: AiProviderSettingsUpdateInput,
  ): Promise<AiProviderSettingsSummary> {
    if (!AI_SETTINGS_PROVIDER_NAMES.includes(provider as AiSettingsProviderName)) {
      throw new ValidationError(`Unsupported AI provider "${provider}"`);
    }

    const typedProvider = provider as AiSettingsProviderName;
    const current = await this.loadProviderRow(organizationId, typedProvider);
    const currentEncryptedApiKey = current ? encryptedApiKey(current.encrypted_credentials) : null;
    const nextHasStoredKey = input.clearKey ? false : Boolean(input.apiKey) || Boolean(currentEncryptedApiKey);

    if (input.enabled && !nextHasStoredKey) {
      throw new ValidationError('Enabled providers require a stored API key');
    }

    const payload = this.buildProviderPayload(organizationId, userId, typedProvider, current, input);
    const row = current
      ? await this.updateProviderRow(current.id, payload)
      : await this.insertProviderRow(payload);

    return summaryFromRow(typedProvider, row);
  }

  async getRuntimePolicy(organizationId: string): Promise<OrganizationAiRuntimePolicy> {
    const [organization, rows] = await Promise.all([
      this.loadOrganization(organizationId),
      this.loadProviderRows(organizationId),
    ]);

    const providers = rows.reduce<OrganizationAiRuntimePolicy['providers']>((acc, row) => {
      if (!AI_SETTINGS_PROVIDER_NAMES.includes(row.provider as AiSettingsProviderName)) {
        return acc;
      }

      const provider = row.provider as AiSettingsProviderName;
      acc[provider] = {
        provider,
        enabled: providerEnabled(row.settings),
        priority: providerPriority(provider, row.settings),
        status: row.status,
        encryptedApiKey: encryptedApiKey(row.encrypted_credentials),
        connectedAt: row.connected_at,
        lastCheckedAt: row.last_checked_at,
        connectedByUserId: row.connected_by,
      };
      return acc;
    }, {});

    return {
      privacyMode: this.privacyModeFromSettings(organization.settings),
      providers,
    };
  }

  private privacyModeFromSettings(settings: Json): AiPrivacyMode {
    if (!isRecord(settings)) return DEFAULT_PRIVACY_MODE;
    return isAiPrivacyMode(settings.privacy_mode) ? settings.privacy_mode : DEFAULT_PRIVACY_MODE;
  }

  private async loadOrganization(organizationId: string): Promise<OrganizationRow> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load organization ${organizationId}: ${error.message}`);
    }
    if (!data) {
      throw new ValidationError(`Organization ${organizationId} was not found`);
    }

    return data as OrganizationRow;
  }

  private async loadProviderRows(organizationId: string): Promise<IntegrationAccountRow[]> {
    const { data, error } = await this.supabase
      .from('integration_accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('type', 'ai_provider');

    if (error) {
      throw new Error(`Failed to load AI provider settings: ${error.message}`);
    }

    return (data ?? []) as IntegrationAccountRow[];
  }

  private async loadProviderRow(
    organizationId: string,
    provider: AiSettingsProviderName,
  ): Promise<IntegrationAccountRow | null> {
    const { data, error } = await this.supabase
      .from('integration_accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('type', 'ai_provider')
      .eq('provider', provider)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load ${provider} AI provider settings: ${error.message}`);
    }

    return (data as IntegrationAccountRow | null) ?? null;
  }

  private buildProviderPayload(
    organizationId: string,
    userId: string,
    provider: AiSettingsProviderName,
    current: IntegrationAccountRow | null,
    input: AiProviderSettingsUpdateInput,
  ): IntegrationAccountInsert {
    const now = new Date().toISOString();
    const existingSettings = isRecord(current?.settings) ? current.settings : {};
    const existingCredentials = isRecord(current?.encrypted_credentials)
      ? { ...current.encrypted_credentials }
      : {};

    if (input.apiKey) {
      if (!this.config.ENCRYPTION_KEY) {
        throw new Error('ENCRYPTION_KEY must be configured before storing AI provider credentials');
      }
      existingCredentials.apiKey = encryptSecret(input.apiKey, this.config.ENCRYPTION_KEY);
    }
    if (input.clearKey) {
      delete existingCredentials.apiKey;
    }

    const hasStoredKey = encryptedApiKey(existingCredentials as Json) != null;

    return {
      organization_id: organizationId,
      provider,
      type: 'ai_provider',
      status: hasStoredKey ? 'connected' : 'disconnected',
      encrypted_credentials: existingCredentials as Json,
      settings: {
        ...existingSettings,
        enabled: input.enabled,
        priority: input.priority,
      } as Json,
      connected_by: hasStoredKey ? (input.apiKey ? userId : current?.connected_by ?? userId) : null,
      connected_at: hasStoredKey ? current?.connected_at ?? now : null,
      last_checked_at: current?.last_checked_at ?? null,
    };
  }

  private async insertProviderRow(payload: IntegrationAccountInsert): Promise<IntegrationAccountRow> {
    const { data, error } = await this.supabase
      .from('integration_accounts')
      .insert(payload)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create AI provider settings: ${error?.message ?? 'unknown error'}`);
    }

    return data as IntegrationAccountRow;
  }

  private async updateProviderRow(
    id: string,
    payload: IntegrationAccountInsert,
  ): Promise<IntegrationAccountRow> {
    const { data, error } = await this.supabase
      .from('integration_accounts')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update AI provider settings: ${error?.message ?? 'unknown error'}`);
    }

    return data as IntegrationAccountRow;
  }
}
