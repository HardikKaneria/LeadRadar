import { Inject, Injectable } from '@nestjs/common';
import type {
  ExternalProviderTestRunAdminDto,
  ExternalProviderUsageSnapshotAdminDto,
} from '@radar/contracts';
import { ValidationError } from '@radar/core';
import type { Database, Json, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import {
  ExternalProviderExecutionError,
  ExternalProviderRateLimitError,
  type ExternalApiKeyRow,
  type ExternalProviderExecuteInput,
  type ExternalProviderExecuteResult,
  type ExternalProviderPlanProfileRow,
  type ExternalUsageMetrics,
} from './external-provider.types';
import { ExternalProviderAdapterRegistryService } from './external-provider-adapter-registry.service';
import { ExternalProviderCacheService } from './external-provider-cache.service';
import { ExternalProviderCapacityService } from './external-provider-capacity.service';
import { ExternalCostCalculatorService } from './external-cost-calculator.service';
import { ExternalProviderIntelligenceService } from './external-provider-intelligence.service';
import { ExternalProviderPoolService } from './external-provider-pool.service';
import { ExternalProviderRoutingService } from './external-provider-routing.service';
import { ExternalProviderUsageService } from './external-provider-usage.service';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown external provider failure';
}

function zeroUsage(unitType: ExternalUsageMetrics['unitType'] = null): ExternalUsageMetrics {
  return {
    unitType,
    requestCount: 0,
    recordCount: 0,
    pageCount: 0,
    searchCount: 0,
    creditCost: 0,
    usdCreditCost: 0,
    usedUnits: 0,
    estimatedCostUsd: 0,
    freeUnitsApplied: 0,
    paidUnitsApplied: 0,
    paidCostUsd: 0,
    // P10-14 extended fields
    successfulRecordCount: 0,
    failedRecordCount: 0,
    resultCount: 0,
    browserMinutes: 0,
    dataMb: 0,
    baseUnits: 0,
    multiplierTotal: 1,
    finalUnits: 0,
    billableUnits: 0,
    unitPriceUsd: 0,
    calculatedCostUsd: 0,
    providerReportedUnits: null,
    providerReportedCostUsd: null,
    costSource: null,
    costRuleId: null,
    costBreakdownJson: {},
  };
}

function isUnauthorizedError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes('401') || message.includes('403') || message.includes('unauthorized') || message.includes('forbidden');
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? {})) as Json;
}

@Injectable()
export class ExternalProviderOrchestratorService {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly registry: ExternalProviderAdapterRegistryService,
    private readonly cache: ExternalProviderCacheService,
    private readonly capacity: ExternalProviderCapacityService,
    private readonly calculator: ExternalCostCalculatorService,
    private readonly intelligence: ExternalProviderIntelligenceService,
    private readonly pool: ExternalProviderPoolService,
    private readonly routing: ExternalProviderRoutingService,
    private readonly usage: ExternalProviderUsageService,
  ) {}

  async call<TRequest, TResponse>(
    input: ExternalProviderExecuteInput<TRequest>,
  ): Promise<ExternalProviderExecuteResult<TResponse>> {
    const route = await this.routing.loadRoute(input.taskType);
    if (!route) {
      throw new Error(`No external provider route configured for ${input.taskType}`);
    }

    const attemptedProviders: typeof route.attempts = [];
    let lastFailure: string | null = null;

    for (const [index, provider] of route.attempts.slice(0, route.maxAttempts).entries()) {
      attemptedProviders.push(provider);

      const adapter = this.registry.get(provider);
      if (!adapter) {
        lastFailure = `No adapter registered for ${provider}`;
        continue;
      }

      const requestHash =
        adapter.buildCacheKey?.(input.taskType, input.request) ??
        this.cache.buildCacheKey(input.taskType, input.request);

      if (!input.options?.forceFresh) {
        const cached = await this.cache.find(provider, input.taskType, input.request, requestHash);
        if (cached) {
          const callId = await this.usage.createCallAttempt({
            organizationId: input.organizationId,
            userId: input.userId ?? null,
            taskType: input.taskType,
            routeId: route.id,
            provider,
            rawPostId: input.rawPostId ?? null,
            searchSessionId: input.searchSessionId ?? null,
            postResearchJobId: input.postResearchJobId ?? null,
            jobRunId: input.jobRunId ?? null,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            attemptNumber: index + 1,
            requestRef: {},
            requestHash,
          });

          const cachedUsage: ExternalUsageMetrics = {
            ...zeroUsage(null),
            usedUnits: Number(cached.units_consumed ?? 0),
            estimatedCostUsd: Number(cached.estimated_cost_usd ?? 0),
          };

          await this.usage.completeCallAttempt(callId, {
            status: 'cached',
            latency_ms: 0,
            estimated_cost: cachedUsage.estimatedCostUsd,
            request_ref: {},
            response_ref: cached.normalized_data,
            response_summary: cached.response_summary,
            request_hash: requestHash ?? null,
            completed_at: new Date().toISOString(),
          });
          await this.usage.recordUsage({
            organizationId: input.organizationId,
            userId: input.userId ?? null,
            taskType: input.taskType,
            provider,
            callId,
            rawPostId: input.rawPostId ?? null,
            searchSessionId: input.searchSessionId ?? null,
            jobRunId: input.jobRunId ?? null,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            requestHash,
            responseSummary: cached.response_summary,
            usage: cachedUsage,
            status: 'skipped_cache',
          });

          return {
            kind: 'success',
            provider,
            routeId: route.id,
            callId,
            response: cached.normalized_data as TResponse,
            status: 'cached',
            usage: cachedUsage,
            providerRequestId: null,
          };
        }
      }

      const claim = await this.pool.claimCredential(
        input.organizationId,
        provider,
        input.taskType,
        (planProfile) => this.calculator.calculateEstimatedUsage(provider, input.taskType, input.request, planProfile),
        {
          entityType: input.entityType ?? 'raw_post',
          entityId: input.entityId ?? input.rawPostId ?? null,
          requestHash,
          inputSummary: input.request && typeof input.request === 'object' ? (input.request as Record<string, unknown>) : {},
        },
      );
      if (!claim) {
        lastFailure = `No eligible ${provider} credential available`;
        continue;
      }

      const startedAt = Date.now();
      const callId = await this.usage.createCallAttempt({
        organizationId: input.organizationId,
        userId: input.userId ?? null,
        taskType: input.taskType,
        routeId: route.id,
        provider,
        credential: claim.credential,
        rawPostId: input.rawPostId ?? null,
        searchSessionId: input.searchSessionId ?? null,
        postResearchJobId: input.postResearchJobId ?? null,
        jobRunId: input.jobRunId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        attemptNumber: index + 1,
        requestHash,
      });

      try {
        const response = await adapter.execute({
          organizationId: input.organizationId,
          userId: input.userId ?? null,
          taskType: input.taskType,
          rawPostId: input.rawPostId ?? null,
          searchSessionId: input.searchSessionId ?? null,
          postResearchJobId: input.postResearchJobId ?? null,
          jobRunId: input.jobRunId ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          timeoutMs: route.timeoutMs,
          request: input.request,
          credential: claim.credential,
          planProfile: claim.credential.planProfile,
        });
        const finishedAt = new Date().toISOString();
        const status = response.status ?? 'success';
        const latencyMs = Date.now() - startedAt;
        const actualUsage = this.finalizeUsage(
          claim.credential.keyState,
          claim.credential.planProfile,
          claim.estimate,
          this.calculator.calculateActualUsage(provider, input.taskType, response.response, claim.credential.planProfile),
          response,
        );

        await this.usage.completeCallAttempt(callId, {
          status,
          latency_ms: latencyMs,
          estimated_cost: actualUsage.estimatedCostUsd,
          provider_request_id: response.providerRequestId ?? null,
          request_hash: requestHash ?? null,
          request_ref: response.requestRef ?? {},
          response_ref: response.responseRef ?? {},
          response_summary: response.responseSummary ?? response.responseRef ?? {},
          completed_at: finishedAt,
        });
        const usageEventId = await this.usage.recordUsage({
          organizationId: input.organizationId,
          userId: input.userId ?? null,
          taskType: input.taskType,
          provider,
          credential: claim.credential,
          callId,
          rawPostId: input.rawPostId ?? null,
          searchSessionId: input.searchSessionId ?? null,
          jobRunId: input.jobRunId ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          requestHash,
          providerRequestId: response.providerRequestId ?? null,
          responseSummary: response.responseSummary ?? response.responseRef ?? {},
          usage: actualUsage,
          status,
        });
        await this.capacity.settle(claim.reservationId, usageEventId, status, actualUsage);

        const cacheTtlSeconds = response.cacheTtlSeconds ?? 7 * 24 * 60 * 60;
        if (cacheTtlSeconds > 0 && requestHash) {
          await this.cache.store({
            provider,
            taskType: input.taskType,
            cacheKey: requestHash,
            responseSummary: response.responseSummary ?? response.responseRef ?? {},
            normalizedData: toJson(response.normalizedData ?? response.response),
            usage: actualUsage,
            sourceProvider: provider,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            confidenceScore: response.cacheConfidenceScore ?? null,
            expiresAt: new Date(Date.now() + cacheTtlSeconds * 1000).toISOString(),
          });
        }

        return {
          kind: 'success',
          provider,
          routeId: route.id,
          callId,
          response: response.response as TResponse,
          status,
          usage: actualUsage,
          providerRequestId: response.providerRequestId ?? null,
        };
      } catch (error) {
        const latencyMs = Date.now() - startedAt;
        const finishedAt = new Date().toISOString();
        const message = errorMessage(error);

        if (error instanceof ExternalProviderRateLimitError) {
          await this.usage.completeCallAttempt(callId, {
            status: 'rate_limited',
            error: message,
            latency_ms: latencyMs,
            retry_after_seconds: error.retryAfterSeconds ?? null,
            request_hash: requestHash ?? null,
            request_ref: error.requestRef ?? {},
            response_ref: error.responseRef ?? {},
            response_summary: error.responseRef ?? {},
            completed_at: finishedAt,
          });
          await this.usage.recordUsage({
            organizationId: input.organizationId,
            userId: input.userId ?? null,
            taskType: input.taskType,
            provider,
            credential: claim.credential,
            callId,
            rawPostId: input.rawPostId ?? null,
            searchSessionId: input.searchSessionId ?? null,
            jobRunId: input.jobRunId ?? null,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            requestHash,
            errorMessage: message,
            responseSummary: error.responseRef ?? {},
            usage: zeroUsage(claim.credential.planProfile?.unit_type ?? null),
            status: 'rate_limited',
          });
          await this.capacity.release(claim.reservationId);
          await this.usage.recordRateLimit({
            provider,
            credential: claim.credential,
            taskType: input.taskType,
            retryAfterSeconds: error.retryAfterSeconds ?? null,
            detail: {
              error: message,
              organizationId: input.organizationId,
            },
          });
          lastFailure = message;
          continue;
        }

        const fallbackAvailable = index < route.attempts.slice(0, route.maxAttempts).length - 1;
        const executionError =
          error instanceof ExternalProviderExecutionError
            ? error
            : new ExternalProviderExecutionError(message);
        const failedStatus: ExternalUsageMetrics = zeroUsage(claim.credential.planProfile?.unit_type ?? null);

        await this.usage.completeCallAttempt(callId, {
          status: fallbackAvailable ? 'fallback' : 'error',
          error: message,
          latency_ms: latencyMs,
          request_hash: requestHash ?? null,
          request_ref: executionError.requestRef ?? {},
          response_ref: executionError.responseRef ?? {},
          response_summary: executionError.responseRef ?? {},
          completed_at: finishedAt,
        });
        await this.usage.recordUsage({
          organizationId: input.organizationId,
          userId: input.userId ?? null,
          taskType: input.taskType,
          provider,
          credential: claim.credential,
          callId,
          rawPostId: input.rawPostId ?? null,
          searchSessionId: input.searchSessionId ?? null,
          jobRunId: input.jobRunId ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          requestHash,
          errorMessage: message,
          responseSummary: executionError.responseRef ?? {},
          usage: failedStatus,
          status: 'failed',
        });
        await this.capacity.release(claim.reservationId);
        if (isUnauthorizedError(error)) {
          await this.usage.markKeyUnauthorized(claim.credential.apiKeyId, message);
        } else {
          await this.usage.markKeyFailure(claim.credential.apiKeyId, message);
        }
        lastFailure = message;
      }
    }

    if (route.allowManualFallback) {
      return {
        kind: 'manual_fallback',
        routeId: route.id,
        reason: lastFailure ?? 'No external provider credential or adapter was available',
        attemptedProviders,
      };
    }

    throw new Error(lastFailure ?? `External provider route exhausted for ${input.taskType}`);
  }

  async execute<TRequest, TResponse>(
    input: ExternalProviderExecuteInput<TRequest>,
  ): Promise<ExternalProviderExecuteResult<TResponse>> {
    return this.call(input);
  }

  async estimateCost<TRequest>(input: {
    provider: string;
    taskType: ExternalProviderExecuteInput<TRequest>['taskType'];
    request: TRequest;
    apiKeyId?: string;
  }): Promise<ExternalUsageMetrics> {
    const credential = input.apiKeyId ? await this.pool.loadCredentialByKeyId(input.apiKeyId) : null;
    return this.calculator.calculateEstimatedUsage(
      input.provider,
      input.taskType,
      input.request,
      credential?.planProfile ?? null,
    );
  }

  async getUsageStatus(input: {
    provider?: string;
    apiKeyId?: string;
    periodType?: 'daily' | 'weekly' | 'monthly' | 'trial' | 'custom';
  }): Promise<ExternalProviderUsageSnapshotAdminDto | null> {
    const snapshots = await this.intelligence.listSnapshots({
      limit: 500,
      periodType: input.periodType,
    });
    return (
      snapshots.items.find(
        (snapshot) =>
          (!input.apiKeyId || snapshot.apiKeyId === input.apiKeyId) &&
          (!input.provider || snapshot.provider === input.provider),
      ) ?? null
    );
  }

  async recalculateUsage(input: {
    providerAccountId?: string;
    apiKeyId?: string;
  }) {
    return this.intelligence.recalculateUsage(input);
  }

  async testKey(input: {
    organizationId: string;
    apiKeyId: string;
    taskType?: ExternalProviderExecuteInput<Record<string, unknown>>['taskType'];
    testPayload?: unknown;
    timeoutMs?: number;
    userId: string;
  }): Promise<ExternalProviderTestRunAdminDto> {
    const credential = await this.pool.loadCredentialByKeyId(input.apiKeyId);
    if (!credential) {
      throw new Error(`External provider key ${input.apiKeyId} was not found`);
    }

    const adapter = this.registry.get(credential.provider);
    if (!adapter?.testKey) {
      throw new Error(`No test flow is registered for ${credential.provider}`);
    }

    const taskType =
      input.taskType ??
      (credential.planProfile?.test_enabled
        ? credential.planProfile?.test_task_type ?? 'provider_health_check'
        : 'provider_health_check');
    const payload = input.testPayload ?? credential.planProfile?.test_payload_json;
    if (payload == null || (typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload as Record<string, unknown>).length === 0)) {
      throw new ValidationError('A safe test payload is required. Configure test payload JSON on the plan or supply it in the request.');
    }

    const estimatedUsage = this.calculator.calculateEstimatedUsage(
      credential.provider,
      taskType,
      payload,
      credential.planProfile,
    );
    const consumesCredits = credential.planProfile?.test_consumes_credits ?? false;
    const startedAt = Date.now();
    const runName = `${credential.provider}:${taskType}`;

    const { data: testRun, error: testRunError } = await this.supabase
      .from('external_provider_test_runs')
      .insert({
        provider: credential.provider,
        provider_account_id: credential.providerAccountId,
        api_key_id: credential.apiKeyId,
        task_type: taskType,
        test_name: runName,
        status: 'running',
        request_payload: toJson(payload),
        response_summary: {},
        estimated_units_used: estimatedUsage.usedUnits,
        estimated_cost_usd: estimatedUsage.estimatedCostUsd,
        created_by: input.userId,
      })
      .select('*')
      .single();

    if (testRunError || !testRun) {
      throw new Error(`Failed to create external provider test run: ${testRunError?.message ?? 'unknown'}`);
    }

    let reservationId: string | null = null;
    if (consumesCredits) {
      reservationId = await this.capacity.reserve({
        provider: credential.provider,
        providerAccountId: credential.providerAccountId,
        apiKeyId: credential.apiKeyId,
        taskType,
        entityType: 'external_api_key',
        entityId: credential.apiKeyId,
        inputSummary: toJson({ test: true }),
        estimate: estimatedUsage,
      });
    }

    const callId = await this.usage.createCallAttempt({
      organizationId: input.organizationId,
      userId: input.userId,
      taskType,
      routeId: null,
      provider: credential.provider,
      credential,
      entityType: 'external_api_key',
      entityId: credential.apiKeyId,
      attemptNumber: 1,
      requestRef: toJson({ test: true }),
    });

    try {
      const response = await adapter.testKey({
        taskType,
        credential,
        timeoutMs: input.timeoutMs,
        payload,
        planProfile: credential.planProfile,
      });
      const finishedAt = new Date().toISOString();
      const actualUsage = this.finalizeUsage(
        credential.keyState,
        credential.planProfile,
        estimatedUsage,
        this.calculator.calculateActualUsage(credential.provider, taskType, response.response, credential.planProfile),
        response,
      );

      await this.usage.completeCallAttempt(callId, {
        status: 'test_success',
        latency_ms: Date.now() - startedAt,
        estimated_cost: actualUsage.estimatedCostUsd,
        provider_request_id: response.providerRequestId ?? null,
        request_ref: response.requestRef ?? {},
        response_ref: response.responseRef ?? {},
        response_summary: response.responseSummary ?? response.responseRef ?? {},
        completed_at: finishedAt,
      });
      const usageEventId = await this.usage.recordUsage({
        organizationId: input.organizationId,
        userId: input.userId,
        taskType,
        provider: credential.provider,
        credential,
        callId,
        entityType: 'external_api_key',
        entityId: credential.apiKeyId,
        providerRequestId: response.providerRequestId ?? null,
        responseSummary: response.responseSummary ?? response.responseRef ?? {},
        usage: actualUsage,
        status: 'test_success',
      });
      if (reservationId) {
        await this.capacity.settle(reservationId, usageEventId, 'test_success', actualUsage);
      }

      await this.usage.recordHealthCheck({
        provider: credential.provider,
        providerAccountId: credential.providerAccountId,
        apiKeyId: credential.apiKeyId,
        status: 'ok',
        latencyMs: Date.now() - startedAt,
        detail: toJson({ testRunId: testRun.id }),
      });

      const { data: updatedTestRun, error: updateError } = await this.supabase
        .from('external_provider_test_runs')
        .update({
          status: 'passed',
          response_summary: response.responseSummary ?? response.responseRef ?? {},
          latency_ms: Date.now() - startedAt,
          estimated_units_used: actualUsage.usedUnits,
          estimated_cost_usd: actualUsage.estimatedCostUsd,
          completed_at: finishedAt,
        })
        .eq('id', testRun.id)
        .select('*')
        .single();

      if (updateError || !updatedTestRun) {
        throw new Error(`Failed to update external provider test run ${testRun.id}: ${updateError?.message ?? 'unknown'}`);
      }

      return this.mapTestRun(updatedTestRun);
    } catch (error) {
      const finishedAt = new Date().toISOString();
      const message = errorMessage(error);
      if (reservationId) {
        await this.capacity.release(reservationId);
      }

      await this.usage.completeCallAttempt(callId, {
        status: 'test_failed',
        latency_ms: Date.now() - startedAt,
        error: message,
        completed_at: finishedAt,
      });
      await this.usage.recordUsage({
        organizationId: input.organizationId,
        userId: input.userId,
        taskType,
        provider: credential.provider,
        credential,
        callId,
        entityType: 'external_api_key',
        entityId: credential.apiKeyId,
        errorMessage: message,
        usage: zeroUsage(credential.planProfile?.unit_type ?? null),
        status: 'test_failed',
      });
      await this.usage.recordHealthCheck({
        provider: credential.provider,
        providerAccountId: credential.providerAccountId,
        apiKeyId: credential.apiKeyId,
        status: error instanceof ExternalProviderRateLimitError ? 'degraded' : 'down',
        latencyMs: Date.now() - startedAt,
        detail: toJson({ testRunId: testRun.id, error: message }),
      });
      if (isUnauthorizedError(error)) {
        await this.usage.markKeyUnauthorized(credential.apiKeyId, message);
      } else {
        await this.usage.markKeyFailure(credential.apiKeyId, message);
      }

      const { data: updatedTestRun, error: updateError } = await this.supabase
        .from('external_provider_test_runs')
        .update({
          status: 'failed',
          response_summary: toJson({ error: message }),
          latency_ms: Date.now() - startedAt,
          error_message: message,
          completed_at: finishedAt,
        })
        .eq('id', testRun.id)
        .select('*')
        .single();

      if (updateError || !updatedTestRun) {
        throw new Error(`Failed to update external provider test run ${testRun.id}: ${updateError?.message ?? 'unknown'}`);
      }

      return this.mapTestRun(updatedTestRun);
    }
  }

  private finalizeUsage(
    keyState: ExternalApiKeyRow,
    planProfile: ExternalProviderPlanProfileRow | null,
    estimatedUsage: ExternalUsageMetrics,
    calculatedUsage: ExternalUsageMetrics,
    response: {
      requestCount?: number;
      recordCount?: number;
      pageCount?: number;
      searchCount?: number;
      creditCost?: number;
      usdCreditCost?: number;
      usedUnits?: number;
      estimatedCostUsd?: number;
      freeUnitsApplied?: number;
      paidUnitsApplied?: number;
      paidCostUsd?: number;
    },
  ): ExternalUsageMetrics {
    const usage: ExternalUsageMetrics = {
      unitType: calculatedUsage.unitType ?? estimatedUsage.unitType,
      requestCount: response.requestCount ?? calculatedUsage.requestCount ?? estimatedUsage.requestCount,
      recordCount: response.recordCount ?? calculatedUsage.recordCount,
      pageCount: response.pageCount ?? calculatedUsage.pageCount,
      searchCount: response.searchCount ?? calculatedUsage.searchCount,
      creditCost: response.creditCost ?? calculatedUsage.creditCost,
      usdCreditCost: response.usdCreditCost ?? calculatedUsage.usdCreditCost,
      usedUnits: response.usedUnits ?? calculatedUsage.usedUnits ?? estimatedUsage.usedUnits,
      estimatedCostUsd:
        response.estimatedCostUsd ?? calculatedUsage.estimatedCostUsd ?? estimatedUsage.estimatedCostUsd,
      freeUnitsApplied: 0,
      paidUnitsApplied: 0,
      paidCostUsd: 0,
      // P10-14 extended fields — propagate from calculatedUsage when available
      successfulRecordCount: calculatedUsage.successfulRecordCount ?? estimatedUsage.successfulRecordCount ?? 0,
      failedRecordCount: calculatedUsage.failedRecordCount ?? estimatedUsage.failedRecordCount ?? 0,
      resultCount: calculatedUsage.resultCount ?? estimatedUsage.resultCount ?? 0,
      browserMinutes: calculatedUsage.browserMinutes ?? estimatedUsage.browserMinutes ?? 0,
      dataMb: calculatedUsage.dataMb ?? estimatedUsage.dataMb ?? 0,
      baseUnits: calculatedUsage.baseUnits ?? estimatedUsage.baseUnits ?? 0,
      multiplierTotal: calculatedUsage.multiplierTotal ?? estimatedUsage.multiplierTotal ?? 1,
      finalUnits: calculatedUsage.finalUnits ?? estimatedUsage.finalUnits ?? 0,
      billableUnits: calculatedUsage.billableUnits ?? estimatedUsage.billableUnits ?? 0,
      unitPriceUsd: calculatedUsage.unitPriceUsd ?? estimatedUsage.unitPriceUsd ?? 0,
      calculatedCostUsd: calculatedUsage.calculatedCostUsd ?? estimatedUsage.calculatedCostUsd ?? 0,
      providerReportedUnits: calculatedUsage.providerReportedUnits ?? estimatedUsage.providerReportedUnits ?? null,
      providerReportedCostUsd: calculatedUsage.providerReportedCostUsd ?? estimatedUsage.providerReportedCostUsd ?? null,
      costSource: calculatedUsage.costSource ?? estimatedUsage.costSource ?? null,
      costRuleId: calculatedUsage.costRuleId ?? estimatedUsage.costRuleId ?? null,
      costBreakdownJson: calculatedUsage.costBreakdownJson ?? estimatedUsage.costBreakdownJson ?? {},
    };

    if (!planProfile) {
      usage.paidUnitsApplied = usage.usedUnits;
      usage.paidCostUsd = usage.estimatedCostUsd;
      return usage;
    }

    const remainingFreeUnits = this.remainingFreeUnits(keyState, planProfile);
    if (!planProfile.overage_enabled) {
      usage.freeUnitsApplied = Math.min(usage.usedUnits, remainingFreeUnits);
      usage.paidUnitsApplied = Math.max(usage.usedUnits - usage.freeUnitsApplied, 0);
      usage.paidCostUsd = 0;
      return usage;
    }

    const freeTier = this.calculator.applyFreeTier(
      usage,
      remainingFreeUnits,
      planProfile.overage_unit_price ?? 0,
    );
    usage.freeUnitsApplied = freeTier.freeUnitsApplied;
    usage.paidUnitsApplied = freeTier.paidUnitsApplied;
    usage.paidCostUsd =
      response.paidCostUsd ?? (planProfile.unit_type === 'usd_credit' ? usage.paidUnitsApplied : freeTier.paidCostUsd);
    return usage;
  }

  private remainingFreeUnits(
    keyState: ExternalApiKeyRow,
    planProfile: ExternalProviderPlanProfileRow,
  ): number {
    const entitlement = Number(planProfile.free_entitlement_amount ?? 0);
    if (entitlement <= 0) return 0;

    const currentUsage =
      planProfile.renewal_interval === 'daily'
        ? Number(keyState.units_used_today ?? 0)
        : planProfile.renewal_interval === 'weekly'
          ? Number(keyState.units_used_week ?? 0)
          : Number(keyState.units_used_month ?? 0);

    return Math.max(entitlement - currentUsage, 0);
  }

  private mapTestRun(
    row: Database['public']['Tables']['external_provider_test_runs']['Row'],
  ): ExternalProviderTestRunAdminDto {
    return {
      id: row.id,
      provider: row.provider,
      providerAccountId: row.provider_account_id,
      apiKeyId: row.api_key_id,
      taskType: row.task_type,
      testName: row.test_name,
      status: row.status,
      requestPayload: row.request_payload,
      responseSummary: row.response_summary,
      latencyMs: row.latency_ms,
      estimatedUnitsUsed: Number(row.estimated_units_used ?? 0),
      estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
      errorCode: row.error_code,
      errorMessage: row.error_message,
      jobRunId: row.job_run_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }
}
