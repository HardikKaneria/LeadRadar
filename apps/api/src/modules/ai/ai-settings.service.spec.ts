import type {
  AiPrivacyMode,
  AiProviderSettingsUpdateInput,
} from '@radar/contracts';
import { decryptSecret, type AppConfig, ValidationError } from '@radar/core';
import type { Database, ServiceClient } from '@radar/supabase';
import { AiSettingsService } from './ai-settings.service';

type OrganizationRow = Database['public']['Tables']['organizations']['Row'];
type IntegrationAccountRow = Database['public']['Tables']['integration_accounts']['Row'];

function organizationRow(overrides: Partial<OrganizationRow> = {}): OrganizationRow {
  return {
    id: 'org-1',
    name: 'Acme',
    slug: 'acme',
    settings: {},
    created_by: 'user-1',
    created_at: '2026-06-24T00:00:00.000Z',
    updated_at: '2026-06-24T00:00:00.000Z',
    ...overrides,
  };
}

function providerRow(overrides: Partial<IntegrationAccountRow> = {}): IntegrationAccountRow {
  return {
    id: 'int-1',
    organization_id: 'org-1',
    provider: 'gemini',
    type: 'ai_provider',
    status: 'connected',
    encrypted_credentials: {},
    settings: { enabled: true, priority: 1 },
    connected_by: 'user-1',
    connected_at: '2026-06-24T00:00:00.000Z',
    last_checked_at: null,
    created_at: '2026-06-24T00:00:00.000Z',
    updated_at: '2026-06-24T00:00:00.000Z',
    ...overrides,
  };
}

function makeSupabase(state: {
  organization: OrganizationRow | null;
  providers: IntegrationAccountRow[];
}): ServiceClient {
  const from = jest.fn((table: string) => {
    const filters = new Map<string, unknown>();
    let pendingUpdate: Record<string, unknown> | undefined;
    let pendingInsert: Record<string, unknown> | undefined;

    const matchingProviders = () =>
      state.providers.filter((row) =>
        [...filters.entries()].every(
          ([key, value]) => (row as unknown as Record<string, unknown>)[key] === value,
        ),
      );

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.set(column, value);
        return chain;
      },
      update: (payload: Record<string, unknown>) => {
        pendingUpdate = payload;
        return chain;
      },
      insert: (payload: Record<string, unknown>) => {
        pendingInsert = payload;
        return chain;
      },
      maybeSingle: async () => {
        if (table === 'organizations') {
          const matches =
            state.organization && (!filters.has('id') || state.organization.id === filters.get('id'))
              ? state.organization
              : null;
          return { data: matches, error: null };
        }

        if (table === 'integration_accounts') {
          return { data: matchingProviders()[0] ?? null, error: null };
        }

        throw new Error(`unexpected table ${table}`);
      },
      single: async () => {
        if (table === 'integration_accounts' && pendingInsert) {
          const row = providerRow({
            id: `int-${state.providers.length + 1}`,
            organization_id: pendingInsert.organization_id as string,
            provider: pendingInsert.provider as string,
            type: pendingInsert.type as IntegrationAccountRow['type'],
            status: pendingInsert.status as IntegrationAccountRow['status'],
            encrypted_credentials: (pendingInsert.encrypted_credentials ?? {}) as IntegrationAccountRow['encrypted_credentials'],
            settings: (pendingInsert.settings ?? {}) as IntegrationAccountRow['settings'],
            connected_by: (pendingInsert.connected_by ?? null) as string | null,
            connected_at: (pendingInsert.connected_at ?? null) as string | null,
            last_checked_at: (pendingInsert.last_checked_at ?? null) as string | null,
          });
          state.providers.push(row);
          return { data: row, error: null };
        }

        if (table === 'integration_accounts' && pendingUpdate) {
          const target = state.providers.find((row) => row.id === filters.get('id'));
          if (!target) return { data: null, error: { message: 'not found' } };
          Object.assign(target, pendingUpdate, { updated_at: '2026-06-24T01:00:00.000Z' });
          return { data: target, error: null };
        }

        throw new Error(`unexpected single() on table ${table}`);
      },
      then: async (resolve: (value: unknown) => unknown) => {
        if (table === 'organizations' && pendingUpdate) {
          if (!state.organization || state.organization.id !== filters.get('id')) {
            return Promise.resolve({ data: null, error: { message: 'not found' } }).then(resolve);
          }
          Object.assign(state.organization, pendingUpdate, { updated_at: '2026-06-24T01:00:00.000Z' });
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }

        if (table === 'integration_accounts' && !pendingInsert && !pendingUpdate) {
          return Promise.resolve({ data: matchingProviders(), error: null }).then(resolve);
        }

        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };

    return chain;
  });

  return { from } as unknown as ServiceClient;
}

function makeService(state: {
  organization?: OrganizationRow | null;
  providers?: IntegrationAccountRow[];
} = {}): { service: AiSettingsService; state: { organization: OrganizationRow | null; providers: IntegrationAccountRow[] } } {
  const sharedState = {
    organization: state.organization ?? organizationRow(),
    providers: state.providers ?? [],
  };

  const service = new AiSettingsService(
    makeSupabase(sharedState),
    { ENCRYPTION_KEY: 'test-encryption-key-1234' } as AppConfig,
  );

  return { service, state: sharedState };
}

describe('AiSettingsService', () => {
  it('lists provider settings with defaults plus the org privacy mode', async () => {
    const { service } = makeService({
      organization: organizationRow({ settings: { privacy_mode: 'paid_only' satisfies AiPrivacyMode } }),
      providers: [
        providerRow({
          provider: 'gemini',
          encrypted_credentials: { apiKey: 'cipher' },
          settings: { enabled: true, priority: 4 },
        }),
      ],
    });

    const result = await service.listProviderSettings('org-1');
    expect(result.privacyMode).toBe('paid_only');
    expect(result.providers).toEqual([
      expect.objectContaining({
        provider: 'gemini',
        enabled: true,
        priority: 4,
        hasStoredKey: true,
        status: 'connected',
      }),
      expect.objectContaining({
        provider: 'groq',
        enabled: false,
        priority: 2,
        hasStoredKey: false,
        status: 'disconnected',
      }),
      expect.objectContaining({
        provider: 'openrouter',
        enabled: false,
        priority: 3,
        hasStoredKey: false,
        status: 'disconnected',
      }),
    ]);
  });

  it('stores an encrypted BYOK credential and marks the provider connected', async () => {
    const { service, state } = makeService();

    const result = await service.updateProviderSetting('org-1', 'user-1', 'groq', {
      enabled: true,
      priority: 1,
      apiKey: 'gsk_test_123456',
    } satisfies AiProviderSettingsUpdateInput);

    expect(result).toMatchObject({
      provider: 'groq',
      enabled: true,
      priority: 1,
      hasStoredKey: true,
      status: 'connected',
      connectedByUserId: 'user-1',
    });

    expect(state.providers).toHaveLength(1);
    expect(
      decryptSecret(
        (state.providers[0]!.encrypted_credentials as { apiKey: string }).apiKey,
        'test-encryption-key-1234',
      ),
    ).toBe('gsk_test_123456');
  });

  it('rejects enabling a provider when no key is stored', async () => {
    const { service } = makeService();

    await expect(
      service.updateProviderSetting('org-1', 'user-1', 'gemini', {
        enabled: true,
        priority: 1,
      } satisfies AiProviderSettingsUpdateInput),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('updates privacy mode without dropping other org settings', async () => {
    const { service, state } = makeService({
      organization: organizationRow({ settings: { scoreThreshold: 85 } }),
    });

    const result = await service.updatePrivacyMode('org-1', 'byok_only');
    expect(result.privacyMode).toBe('byok_only');
    expect(state.organization?.settings).toEqual({
      scoreThreshold: 85,
      privacy_mode: 'byok_only',
    });
  });
});
