import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AiCallContext, AiTaskType } from '@radar/ai';
import { RateLimitError, type AppConfig } from '@radar/core';
import type { Database, ServiceClient } from '@radar/supabase';
import { APP_CONFIG } from '../../config/app-config.module';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type { AiKeyCandidate } from './ai-provider-pool.service';

type CompanyUsageLimitRow = Database['public']['Tables']['company_usage_limits']['Row'];

interface TokenBucketDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface BucketState {
  tokens: number;
  updatedAtMs: number;
}

function toWholeRequestsPerMinute(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  return rounded >= 0 ? rounded : null;
}

export function resolveOrganizationRateLimitRpm(
  row: Pick<CompanyUsageLimitRow, 'request_rate_limit_rpm'> | null,
  config: Pick<AppConfig, 'AI_ORG_REQUEST_RATE_LIMIT_RPM'>,
): number | null {
  if (row?.request_rate_limit_rpm != null) {
    return toWholeRequestsPerMinute(row.request_rate_limit_rpm);
  }
  return toWholeRequestsPerMinute(config.AI_ORG_REQUEST_RATE_LIMIT_RPM);
}

@Injectable()
export class AiRateLimitService {
  private readonly logger = new Logger(AiRateLimitService.name);
  private readonly buckets = new Map<string, BucketState>();
  private cleanupInterval: NodeJS.Timeout;
  private dailyResetInterval: NodeJS.Timeout;
  private nextDailyResetAt: Date;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
  ) {
    // Stale in-memory bucket cleanup every 5 min
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, state] of this.buckets.entries()) {
        if (now - state.updatedAtMs > 60_000 * 5) {
          this.buckets.delete(key);
        }
      }
    }, 60_000 * 5);

    // Daily reset of requests_used_today at midnight UTC.
    // Runs every 60 s and fires the reset once the clock has crossed midnight.
    this.nextDailyResetAt = this.nextMidnightUtc();
    this.dailyResetInterval = setInterval(() => {
      if (Date.now() >= this.nextDailyResetAt.getTime()) {
        this.nextDailyResetAt = this.nextMidnightUtc();
        void this.resetDailyKeyUsage();
      }
    }, 60_000);
  }

  private nextMidnightUtc(): Date {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return midnight;
  }

  private async resetDailyKeyUsage(): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ai_api_keys')
        .update({ requests_used_today: 0 })
        .gt('requests_used_today', 0);
      if (error) throw error;
      this.logger.log('Daily AI key usage reset completed');
    } catch (err) {
      this.logger.error(`Daily AI key usage reset failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async assertWithinOrganizationRateLimit(
    ctx: AiCallContext,
    row: Pick<CompanyUsageLimitRow, 'request_rate_limit_rpm'> | null,
  ): Promise<void> {
    const requestsPerMinute = resolveOrganizationRateLimitRpm(row, this.config);
    if (requestsPerMinute == null || requestsPerMinute <= 0) return;

    const decision = this.consumeTokenBucket(
      `ai-rate:org:${ctx.organizationId}:rpm`,
      1,
      requestsPerMinute,
      requestsPerMinute / 60,
    );

    if (!decision.allowed) {
      throw new RateLimitError('AI organization request rate limit exceeded', {
        metric: 'ai_requests',
        scope: 'organization_rate',
        retryAfterSeconds: decision.retryAfterSeconds,
        remaining: decision.remaining,
        limitRpm: requestsPerMinute,
      });
    }
  }

  async claimProviderRequest(candidate: AiKeyCandidate, _taskType: AiTaskType): Promise<boolean> {
    const requestsPerMinute = toWholeRequestsPerMinute(candidate.account.rate_limit_rpm);
    if (requestsPerMinute == null || requestsPerMinute <= 0) return true;

    const decision = this.consumeTokenBucket(
      `ai-rate:provider-account:${candidate.account.id}:rpm`,
      1,
      requestsPerMinute,
      requestsPerMinute / 60,
    );

    if (!decision.allowed) {
      return false;
    }

    return true;
  }

  providerCooldownSeconds(retryAfterSeconds?: number | null): number {
    if (retryAfterSeconds != null && retryAfterSeconds > 0) {
      return Math.ceil(retryAfterSeconds);
    }
    return this.config.AI_PROVIDER_RATE_LIMIT_COOLDOWN_SECONDS;
  }

  private consumeTokenBucket(
    key: string,
    requested: number,
    capacity: number,
    refillPerSecond: number,
  ): TokenBucketDecision {
    const nowMs = Date.now();
    let state = this.buckets.get(key);

    if (!state) {
      state = { tokens: capacity, updatedAtMs: nowMs };
    }

    const elapsedMs = Math.max(0, nowMs - state.updatedAtMs);
    const refill = (elapsedMs / 1000) * refillPerSecond;
    let tokens = Math.min(capacity, state.tokens + refill);

    let allowed = false;
    let retryAfterSeconds = 0;

    if (tokens >= requested) {
      allowed = true;
      tokens -= requested;
    } else if (refillPerSecond > 0) {
      retryAfterSeconds = Math.ceil(((requested - tokens) / refillPerSecond));
    }

    this.buckets.set(key, { tokens, updatedAtMs: nowMs });

    return {
      allowed,
      remaining: Math.max(0, Math.floor(tokens)),
      retryAfterSeconds,
    };
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
    clearInterval(this.dailyResetInterval);
  }
}
