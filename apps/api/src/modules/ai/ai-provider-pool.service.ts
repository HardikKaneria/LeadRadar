import { Inject, Injectable } from '@nestjs/common';
import {
  AIService,
  buildLiveProviders,
  type AIServiceOptions,
  type AiTaskType,
  type LiveProvidersConfig,
  type ProviderCredential,
  type ProviderName,
  type TaskRoute,
} from '@radar/ai';
import type { AiPrivacyMode } from '@radar/contracts';
import { decryptSecret, type AppConfig } from '@radar/core';
import type { Database, ServiceClient } from '@radar/supabase';
import { APP_CONFIG } from '../../config/app-config.module';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AiRateLimitService } from './ai-rate-limit.service';
import { AiPromptService } from './ai-prompt.service';
import { AiRoutingService } from './ai-routing.service';
import { AiUsageService } from './ai-usage.service';
import { AiSettingsService } from './ai-settings.service';

type PooledProviderName = Extract<ProviderName, 'gemini' | 'groq' | 'openrouter' | 'jina'>;
type AiApiKeyRow = Database['public']['Tables']['ai_api_keys']['Row'];
type AiProviderAccountRow = Database['public']['Tables']['ai_provider_accounts']['Row'];

export interface AiKeyCandidate {
  key: AiApiKeyRow;
  account: AiProviderAccountRow;
}

const PROVIDER_PRIORITY: Record<AiProviderAccountRow['account_type'], number> = {
  free_tier: 0,
  self_hosted: 1,
  paid: 2,
  byok: 3,
};

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
}

export function isEligibleAiKey(candidate: AiKeyCandidate, taskType: AiTaskType, now = Date.now()): boolean {
  if (candidate.account.status === 'disabled') return false;
  if (candidate.key.revoked_at) return false;

  if (
    candidate.key.status !== 'active' &&
    candidate.key.status !== 'cooldown'
  ) {
    return false;
  }

  const cooldownUntil = parseTimestamp(candidate.key.cooldown_until);
  if (candidate.key.status === 'cooldown' && cooldownUntil == null) return false;
  if (cooldownUntil != null && cooldownUntil > now) return false;

  const allowedTaskTypes = candidate.key.allowed_task_types ?? [];
  if (allowedTaskTypes.length > 0 && !allowedTaskTypes.includes(taskType)) return false;

  if (
    candidate.key.daily_request_limit != null &&
    candidate.key.requests_used_today >= candidate.key.daily_request_limit
  ) {
    return false;
  }
  if (
    candidate.key.monthly_token_limit != null &&
    candidate.key.tokens_used_month >= candidate.key.monthly_token_limit
  ) {
    return false;
  }
  if (
    candidate.key.monthly_cost_limit != null &&
    candidate.key.cost_used_month >= candidate.key.monthly_cost_limit
  ) {
    return false;
  }
  if (
    candidate.account.monthly_budget != null &&
    candidate.account.monthly_usage >= candidate.account.monthly_budget
  ) {
    return false;
  }

  return true;
}

function compareAiKeyCandidates(a: AiKeyCandidate, b: AiKeyCandidate): number {
  const providerPriorityDiff = PROVIDER_PRIORITY[a.account.account_type] - PROVIDER_PRIORITY[b.account.account_type];
  if (providerPriorityDiff !== 0) return providerPriorityDiff;

  const aLastUsed = parseTimestamp(a.key.last_used_at);
  const bLastUsed = parseTimestamp(b.key.last_used_at);
  if (aLastUsed == null && bLastUsed != null) return -1;
  if (aLastUsed != null && bLastUsed == null) return 1;
  if (aLastUsed != null && bLastUsed != null && aLastUsed !== bLastUsed) return aLastUsed - bLastUsed;

  return a.key.created_at.localeCompare(b.key.created_at);
}

export function orderedEligibleAiKeys(
  candidates: AiKeyCandidate[],
  taskType: AiTaskType,
  now = Date.now(),
): AiKeyCandidate[] {
  const eligible = candidates.filter((candidate) => isEligibleAiKey(candidate, taskType, now));
  eligible.sort(compareAiKeyCandidates);
  return eligible;
}

export function pickEligibleAiKey(
  candidates: AiKeyCandidate[],
  taskType: AiTaskType,
  now = Date.now(),
): AiKeyCandidate | null {
  return orderedEligibleAiKeys(candidates, taskType, now)[0] ?? null;
}

export function applyOrganizationProviderPolicy(
  routes: Partial<Record<AiTaskType, TaskRoute>>
): Partial<Record<AiTaskType, TaskRoute>> {
  return routes;
}

export interface BuildAiServiceOptions extends Omit<AIServiceOptions, 'providers'> {
  organizationId?: string;
}

@Injectable()
export class AiProviderPoolService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly routing: AiRoutingService,
    private readonly prompts: AiPromptService,
    private readonly usage: AiUsageService,
    private readonly rateLimits: AiRateLimitService,
    private readonly settings: AiSettingsService,
  ) {}

  buildLiveProvidersConfig(): LiveProvidersConfig {
    const config: LiveProvidersConfig = {};

    if (this.shouldRegisterProvider('gemini')) {
      config.gemini = {
        apiKey: this.config.GEMINI_API_KEY,
        resolveCredential: (taskType) => this.resolveCredential('gemini', taskType),
      };
    }

    if (this.shouldRegisterProvider('groq')) {
      config.groq = {
        apiKey: this.config.GROQ_API_KEY,
        resolveCredential: (taskType) => this.resolveCredential('groq', taskType),
      };
    }

    if (this.shouldRegisterProvider('openrouter')) {
      config.openrouter = {
        apiKey: this.config.OPENROUTER_API_KEY,
        resolveCredential: (taskType) => this.resolveCredential('openrouter', taskType),
        referer: this.config.WEB_ORIGIN,
        title: 'Radar OIP',
      };
    }

    if (this.shouldRegisterProvider('jina')) {
      config.jina = {
        // Fallback to env var if DB key doesn't exist
        apiKey: (this.config as any).JINA_API_KEY,
        resolveCredential: (taskType) => this.resolveCredential('jina', taskType),
      };
    }

    if (this.config.OLLAMA_BASE_URL) {
      config.ollama = { baseUrl: this.config.OLLAMA_BASE_URL };
    }

    return config;
  }

  async buildService(options: BuildAiServiceOptions = {}): Promise<AIService> {
    const outerBeforeCall = options.hooks?.beforeCall;
    const outerHook = options.hooks?.onCall;
    const [dbRoutes, privacyMode] = await Promise.all([
      this.routing.loadActiveRoutes(),
      options.organizationId && !options.privacyMode
        ? this.settings.getOrgPrivacyMode(options.organizationId)
        : Promise.resolve(options.privacyMode),
    ]);
    const adjustedRoutes = applyOrganizationProviderPolicy(dbRoutes);
    const aiOptions = { ...options, privacyMode };
    delete aiOptions.organizationId;
    return new AIService({
      ...aiOptions,
      providers: buildLiveProviders(this.buildLiveProvidersConfig()),
      routes: { ...adjustedRoutes, ...(aiOptions.routes ?? {}) },
      resolvePrompt: aiOptions.resolvePrompt ?? ((ctx) => this.prompts.resolveActivePrompt(ctx)),
      hooks: {
        ...aiOptions.hooks,
        beforeCall: async (ctx) => {
          await this.usage.assertWithinUsageLimits(ctx);
          await outerBeforeCall?.(ctx);
        },
        onCall: async (record) => {
          await this.usage.recordCall(record);
          await outerHook?.(record);
        },
      },
    });
  }

  private shouldRegisterProvider(provider: PooledProviderName): boolean {
    return Boolean(this.config.ENCRYPTION_KEY || this.fallbackApiKey(provider));
  }

  private fallbackApiKey(provider: PooledProviderName): string | undefined {
    switch (provider) {
      case 'gemini':
        return this.config.GEMINI_API_KEY;
      case 'groq':
        return this.config.GROQ_API_KEY;
      case 'openrouter':
        return this.config.OPENROUTER_API_KEY;
    }
  }

  private async resolveCredential(
    provider: PooledProviderName,
    taskType: AiTaskType,
  ): Promise<ProviderCredential> {
    const pooled = await this.resolvePooledCredential(provider, taskType);
    if (pooled) return pooled;

    const fallbackApiKey = this.fallbackApiKey(provider);
    if (fallbackApiKey) return { apiKey: fallbackApiKey };

    throw new Error(`No eligible ${provider} credential configured for task "${taskType}"`);
  }

  private async resolvePooledCredential(
    provider: PooledProviderName,
    taskType: AiTaskType,
  ): Promise<ProviderCredential | null> {
    if (!this.config.ENCRYPTION_KEY) {
      return null;
    }

    const candidates = orderedEligibleAiKeys(
      await this.listKeyCandidates(provider),
      taskType,
    );
    for (const candidate of candidates) {
      if (!(await this.rateLimits.claimProviderRequest(candidate, taskType))) {
        continue;
      }

      return {
        apiKey: decryptSecret(candidate.key.encrypted_api_key, this.config.ENCRYPTION_KEY),
        apiKeyId: candidate.key.id,
        providerAccountId: candidate.account.id,
        isFreeTier: candidate.account.account_type === 'free_tier',
      };
    }

    return null;
  }

  private async listKeyCandidates(provider: PooledProviderName): Promise<AiKeyCandidate[]> {
    const { data: keys, error } = await this.supabase
      .from('ai_api_keys')
      .select('*')
      .eq('provider', provider)
      .is('revoked_at', null);

    if (error) {
      throw new Error(`Failed to load ${provider} AI keys: ${error.message}`);
    }

    const providerKeys = (keys ?? []) as AiApiKeyRow[];
    if (providerKeys.length === 0) return [];

    const accountIds = [...new Set(providerKeys.map((key) => key.provider_account_id))];
    const { data: accounts, error: accountError } = await this.supabase
      .from('ai_provider_accounts')
      .select('*')
      .in('id', accountIds);

    if (accountError) {
      throw new Error(`Failed to load ${provider} AI provider accounts: ${accountError.message}`);
    }

    const accountMap = new Map(
      ((accounts ?? []) as AiProviderAccountRow[]).map((account) => [account.id, account] as const),
    );

    return providerKeys.flatMap((key) => {
      const account = accountMap.get(key.provider_account_id);
      return account ? [{ key, account }] : [];
    });
  }
}
