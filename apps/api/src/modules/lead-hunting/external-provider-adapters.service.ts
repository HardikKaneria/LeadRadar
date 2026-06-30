import { Injectable } from '@nestjs/common';
import {
  ExternalProviderExecutionError,
  ExternalProviderRateLimitError,
  type ExternalProvider,
  type ExternalProviderAdapter,
  type ExternalProviderAdapterContext,
  type ExternalProviderAdapterResponse,
  type ExternalProviderTaskType,
  type ExternalProviderTestContext,
} from './external-provider.types';
import type { Json } from '@radar/supabase';
import { ExternalProviderAdapterRegistryService } from './external-provider-adapter-registry.service';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => sanitizeJson(entry));
  const record = asRecord(value);
  if (!record) return value;

  const hidden = ['authorization', 'apiKey', 'api_key', 'token', 'secret', 'cookie', 'set-cookie'];
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [
      key,
      hidden.includes(key.toLowerCase()) ? '[redacted]' : sanitizeJson(entry),
    ]),
  );
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

function inferCount(record: JsonRecord | null, keys: string[]): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const nested = asRecord(value);
    if (nested) {
      const nestedCount = inferCount(nested, ['count', 'total', 'records', 'items', 'results', 'pages']);
      if (nestedCount != null) return nestedCount;
    }
  }
  return undefined;
}

abstract class BaseHttpExternalProviderAdapter implements ExternalProviderAdapter<JsonRecord, unknown> {
  abstract readonly provider: ExternalProvider;

  constructor(protected readonly registry: ExternalProviderAdapterRegistryService) {
    registry.register(this);
  }

  buildCacheKey(taskType: ExternalProviderTaskType, request: JsonRecord): string | null {
    const candidate =
      asString(request.profileUrl) ??
      asString(request.companyUrl) ??
      asString(request.postUrl) ??
      asString(request.websiteUrl) ??
      asString(request.url) ??
      asString(request.domain) ??
      asString(request.query);
    return candidate ? `${taskType}:${candidate.toLowerCase()}` : null;
  }

  async testKey(
    context: ExternalProviderTestContext<JsonRecord>,
  ): Promise<ExternalProviderAdapterResponse<unknown>> {
    return this.execute({
      organizationId: 'test',
      taskType: context.taskType,
      request: context.payload,
      credential: context.credential,
      timeoutMs: context.timeoutMs,
      planProfile: context.planProfile,
    });
  }

  async execute(
    context: ExternalProviderAdapterContext<JsonRecord>,
  ): Promise<ExternalProviderAdapterResponse<unknown>> {
    const http = asRecord(context.request.http) ?? context.request;
    const url = this.resolveUrl(context, http);
    if (!url) {
      throw new ExternalProviderExecutionError(
        `${this.provider} adapter requires an explicit endpoint/url configuration for ${context.taskType}`,
      );
    }

    const method = asString(http.method)?.toUpperCase() ?? (http.body ? 'POST' : 'GET');
    const headers = new Headers({
      accept: 'application/json, text/plain;q=0.9',
      ...this.baseHeaders(context),
    });

    const configuredHeaders = asRecord(http.headers);
    if (configuredHeaders) {
      for (const [key, value] of Object.entries(configuredHeaders)) {
        if (typeof value === 'string') headers.set(key, value);
      }
    }

    let requestUrl = new URL(url);
    this.applyAuth(requestUrl, headers, context);

    const bodyValue = http.body ?? context.request.body;
    let body: string | undefined;
    if (bodyValue != null) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(bodyValue);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), context.timeoutMs ?? 30_000);

    try {
      const startedAt = Date.now();
      const response = await fetch(requestUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const latencyMs = Date.now() - startedAt;
      const responseText = await response.text();
      const responseJson = this.parseResponse(responseText);
      const summary = sanitizeJson(responseJson ?? responseText);

      if (response.status === 429) {
        throw new ExternalProviderRateLimitError(`${this.provider} rate limited the request`, {
          retryAfterSeconds: Number(response.headers.get('retry-after') ?? 60),
          requestRef: toJson(sanitizeJson({ url: requestUrl.toString(), method, body: bodyValue })),
          responseRef: toJson(summary),
        });
      }

      if (response.status === 401 || response.status === 403) {
        throw new ExternalProviderExecutionError(`${this.provider} rejected the credential (${response.status})`, {
          requestRef: toJson(sanitizeJson({ url: requestUrl.toString(), method, body: bodyValue })),
          responseRef: toJson(summary),
        });
      }

      if (!response.ok) {
        throw new ExternalProviderExecutionError(`${this.provider} returned ${response.status}`, {
          requestRef: toJson(sanitizeJson({ url: requestUrl.toString(), method, body: bodyValue })),
          responseRef: toJson(summary),
        });
      }

      const normalized = asRecord(responseJson) ?? { raw: responseJson ?? responseText };
      const recordCount = inferCount(asRecord(responseJson), ['records', 'results', 'items', 'people']) ?? 0;
      const pageCount = inferCount(asRecord(responseJson), ['pages']) ?? 0;
      const searchCount = context.taskType === 'public_search' ? 1 : 0;
      const providerCost =
        typeof normalized.cost === 'number'
          ? normalized.cost
          : typeof normalized.usageUsd === 'number'
            ? normalized.usageUsd
            : 0;

      return {
        response: normalized,
        normalizedData: toJson(normalized),
        status: 'success',
        requestCount: 1,
        recordCount,
        pageCount,
        searchCount,
        usedUnits: Math.max(recordCount, pageCount, searchCount, 1),
        estimatedCostUsd: providerCost,
        providerRequestId:
          response.headers.get('x-request-id') ??
          asString(normalized.requestId) ??
          asString(normalized.id) ??
          null,
        requestRef: toJson(sanitizeJson({ url: requestUrl.toString(), method, body: bodyValue })),
        responseRef: toJson(summary),
        responseSummary: toJson(sanitizeJson({
          latencyMs,
          status: response.status,
          body: summary,
        })),
        cacheTtlSeconds: 7 * 24 * 60 * 60,
        cacheConfidenceScore: 90,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new ExternalProviderExecutionError(`${this.provider} request timed out`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  protected resolveUrl(
    context: ExternalProviderAdapterContext<JsonRecord>,
    request: JsonRecord,
  ): string | null {
    const explicit =
      asString(request.url) ??
      asString(request.endpoint) ??
      asString(request.apiUrl);
    if (explicit) return explicit;

    const path = asString(request.path);
    if (path && context.credential.baseUrl) {
      return new URL(path, context.credential.baseUrl).toString();
    }

    return null;
  }

  protected parseResponse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  protected baseHeaders(_context: ExternalProviderAdapterContext<JsonRecord>): Record<string, string> {
    return {};
  }

  protected abstract applyAuth(
    url: URL,
    headers: Headers,
    context: ExternalProviderAdapterContext<JsonRecord>,
  ): void;
}

abstract class BearerAdapter extends BaseHttpExternalProviderAdapter {
  protected applyAuth(_url: URL, headers: Headers, context: ExternalProviderAdapterContext<JsonRecord>): void {
    headers.set('authorization', `Bearer ${context.credential.apiKey}`);
  }
}

abstract class QueryStringApiKeyAdapter extends BaseHttpExternalProviderAdapter {
  protected applyAuth(url: URL, _headers: Headers, context: ExternalProviderAdapterContext<JsonRecord>): void {
    url.searchParams.set('api_key', context.credential.apiKey);
  }
}

@Injectable()
export class BrightDataAdapterService extends BearerAdapter {
  readonly provider = 'bright_data' as const;
  constructor(registry: ExternalProviderAdapterRegistryService) { super(registry); }
}

@Injectable()
export class ApifyAdapterService extends BearerAdapter {
  readonly provider = 'apify' as const;
  constructor(registry: ExternalProviderAdapterRegistryService) { super(registry); }
}

@Injectable()
export class PeopleDataLabsAdapterService extends BaseHttpExternalProviderAdapter {
  readonly provider = 'people_data_labs' as const;
  constructor(registry: ExternalProviderAdapterRegistryService) { super(registry); }

  protected applyAuth(_url: URL, headers: Headers, context: ExternalProviderAdapterContext<JsonRecord>): void {
    headers.set('x-api-key', context.credential.apiKey);
  }
}

@Injectable()
export class TavilyAdapterService extends BearerAdapter {
  readonly provider = 'tavily' as const;
  constructor(registry: ExternalProviderAdapterRegistryService) { super(registry); }
}

@Injectable()
export class SerpApiAdapterService extends QueryStringApiKeyAdapter {
  readonly provider = 'serpapi' as const;
  constructor(registry: ExternalProviderAdapterRegistryService) { super(registry); }
}

@Injectable()
export class FirecrawlAdapterService extends BearerAdapter {
  readonly provider = 'firecrawl' as const;
  constructor(registry: ExternalProviderAdapterRegistryService) { super(registry); }
}

@Injectable()
export class ScraperApiAdapterService extends QueryStringApiKeyAdapter {
  readonly provider = 'scraperapi' as const;
  constructor(registry: ExternalProviderAdapterRegistryService) { super(registry); }
}

@Injectable()
export class MockExternalProviderAdapterService extends BaseHttpExternalProviderAdapter {
  readonly provider = 'internal' as const;
  constructor(registry: ExternalProviderAdapterRegistryService) { super(registry); }

  protected applyAuth(): void {}

  override async execute(
    context: ExternalProviderAdapterContext<JsonRecord>,
  ): Promise<ExternalProviderAdapterResponse<unknown>> {
    const response = asRecord(context.request.mockResponse) ?? {
      ok: true,
      provider: this.provider,
      taskType: context.taskType,
    };

    return {
      response,
      normalizedData: toJson(response),
      status: 'success',
      requestCount: 1,
      usedUnits: 1,
      estimatedCostUsd: 0,
      responseSummary: toJson({ mock: true, response }),
      requestRef: toJson({ mock: true }),
      responseRef: toJson(response),
      cacheTtlSeconds: 60,
      cacheConfidenceScore: 100,
    };
  }
}
