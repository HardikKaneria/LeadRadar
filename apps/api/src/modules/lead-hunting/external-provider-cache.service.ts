import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type {
  ExternalProvider,
  ExternalProviderCacheEntryRow,
  ExternalProviderTaskType,
  ExternalUsageMetrics,
} from './external-provider.types';

type CacheInsert = {
  provider: ExternalProvider;
  taskType: ExternalProviderTaskType;
  cacheKey: string;
  responseSummary: Json;
  normalizedData: Json;
  usage: ExternalUsageMetrics;
  sourceProvider: ExternalProvider;
  entityType?: string | null;
  entityId?: string | null;
  confidenceScore?: number | null;
  expiresAt: string;
};

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function buildHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

@Injectable()
export class ExternalProviderCacheService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async find(
    provider: ExternalProvider,
    taskType: ExternalProviderTaskType,
    request: unknown,
    explicitCacheKey?: string | null,
  ): Promise<ExternalProviderCacheEntryRow | null> {
    const cacheKey = explicitCacheKey ?? this.buildCacheKey(taskType, request);
    if (!cacheKey) return null;

    const { data, error } = await this.supabase
      .from('external_provider_cache_entries')
      .select('*')
      .eq('provider', provider)
      .eq('task_type', taskType)
      .eq('cache_key', cacheKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load external provider cache entry: ${error.message}`);
    }

    if (!data) return null;

    await this.supabase
      .from('external_provider_cache_entries')
      .update({
        hit_count: (data.hit_count ?? 0) + 1,
        last_hit_at: new Date().toISOString(),
      })
      .eq('id', data.id);

    return data as ExternalProviderCacheEntryRow;
  }

  async store(input: CacheInsert): Promise<void> {
    const { error } = await this.supabase
      .from('external_provider_cache_entries')
      .upsert({
        provider: input.provider,
        task_type: input.taskType,
        cache_key: input.cacheKey,
        response_summary: input.responseSummary,
        normalized_data: input.normalizedData,
        units_consumed: input.usage.usedUnits,
        estimated_cost_usd: input.usage.estimatedCostUsd,
        source_provider: input.sourceProvider,
        confidence_score: input.confidenceScore ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        cached_at: new Date().toISOString(),
        expires_at: input.expiresAt,
        last_hit_at: null,
        hit_count: 0,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to store external provider cache entry: ${error.message}`);
    }
  }

  buildCacheKey(taskType: ExternalProviderTaskType, request: unknown): string | null {
    const record = request && typeof request === 'object' ? (request as Record<string, unknown>) : null;
    if (!record) return null;

    const payload =
      taskType === 'linkedin_profile_lookup'
        ? { profileUrl: normalizeString(record.profileUrl), profileName: normalizeString(record.profileName) }
        : taskType === 'linkedin_company_lookup'
          ? { companyUrl: normalizeString(record.companyUrl), companyName: normalizeString(record.companyName) }
          : taskType === 'linkedin_post_lookup'
            ? { postUrl: normalizeString(record.postUrl) }
            : taskType === 'website_crawl' || taskType === 'blocked_website_fetch'
              ? { url: normalizeString(record.url) ?? normalizeString(record.websiteUrl) }
              : taskType === 'public_search'
                ? { query: normalizeString(record.query) }
                : taskType === 'person_enrichment'
                  ? {
                      email: normalizeString(record.email),
                      profileUrl: normalizeString(record.profileUrl),
                      fullName: normalizeString(record.fullName),
                    }
                  : taskType === 'company_enrichment' || taskType === 'website_discovery'
                    ? {
                        websiteUrl: normalizeString(record.websiteUrl),
                        domain: normalizeString(record.domain),
                        companyName: normalizeString(record.companyName),
                      }
                    : taskType === 'email_discovery'
                      ? {
                          domain: normalizeString(record.domain),
                          fullName: normalizeString(record.fullName),
                          companyName: normalizeString(record.companyName),
                        }
                      : taskType === 'management_discovery' || taskType === 'tech_stack_detection'
                        ? { websiteUrl: normalizeString(record.websiteUrl), domain: normalizeString(record.domain) }
                        : taskType === 'country_resolution'
                          ? {
                              websiteUrl: normalizeString(record.websiteUrl),
                              location: normalizeString(record.location),
                              companyName: normalizeString(record.companyName),
                            }
                          : null;

    if (!payload) return null;
    if (!Object.values(payload).some(Boolean)) return null;
    return buildHash({ taskType, ...payload });
  }
}
