import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type AppConfig } from '@radar/core';
import type { ServiceClient } from '@radar/supabase';
import { APP_CONFIG } from '../../config/app-config.module';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type { ExternalProviderKeyCandidate } from './external-provider.types';

interface TokenBucketDecision {
  allowed: boolean;
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

@Injectable()
export class ExternalProviderRateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(ExternalProviderRateLimitService.name);
  private readonly buckets = new Map<string, BucketState>();
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly dailyResetInterval: NodeJS.Timeout;
  private nextDailyResetAt: Date;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
  ) {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, state] of this.buckets.entries()) {
        if (now - state.updatedAtMs > 60_000 * 5) {
          this.buckets.delete(key);
        }
      }
    }, 60_000 * 5);

    this.nextDailyResetAt = this.nextMidnightUtc();
    this.dailyResetInterval = setInterval(() => {
      if (Date.now() >= this.nextDailyResetAt.getTime()) {
        this.nextDailyResetAt = this.nextMidnightUtc();
        void this.resetDailyKeyUsage();
      }
    }, 60_000);
  }

  async claimProviderRequest(candidate: ExternalProviderKeyCandidate): Promise<TokenBucketDecision> {
    const requestsPerMinute = toWholeRequestsPerMinute(candidate.account.rate_limit_rpm);
    if (requestsPerMinute == null || requestsPerMinute <= 0) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return this.consumeTokenBucket(
      `external-rate:provider-account:${candidate.account.id}:rpm`,
      1,
      requestsPerMinute,
      requestsPerMinute / 60,
    );
  }

  providerCooldownSeconds(retryAfterSeconds?: number | null): number {
    if (retryAfterSeconds != null && retryAfterSeconds > 0) {
      return Math.ceil(retryAfterSeconds);
    }
    return this.config.AI_PROVIDER_RATE_LIMIT_COOLDOWN_SECONDS;
  }

  private nextMidnightUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  }

  private async resetDailyKeyUsage(): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('external_api_keys')
        .update({ requests_used_today: 0 })
        .gt('requests_used_today', 0);
      if (error) throw error;
      this.logger.log('Daily external provider key usage reset completed');
    } catch (error) {
      this.logger.error(
        `Daily external provider key usage reset failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
      retryAfterSeconds = Math.ceil((requested - tokens) / refillPerSecond);
    }

    this.buckets.set(key, { tokens, updatedAtMs: nowMs });
    return { allowed, retryAfterSeconds };
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
    clearInterval(this.dailyResetInterval);
  }
}
