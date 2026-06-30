/**
 * Free-first model router: walk a task route's ordered attempts (primary → fallback → fallback_2),
 * skipping providers that are not registered or whose circuit breaker is open, and falling back on
 * error. Returns the first success, or throws AiUnavailableError. The full router (plan/limit →
 * privacy → key availability → rate/cost) lands with the key pool in P3-13; this is the core
 * provider/fallback/circuit-breaker layer.
 */

import {
  AiUnavailableError,
  type AiProvider,
  type ProviderName,
  type RouteAttempt,
  type TaskRoute,
} from './types';

interface BreakerState {
  failures: number;
  openUntil: number;
}

export interface RouterOptions {
  /** Consecutive failures before a provider's breaker opens. Default 3. */
  failureThreshold?: number;
  /** Cooldown (ms) while the breaker is open. Default 30_000. */
  cooldownMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface AttemptOutcome<R> {
  result: R;
  provider: ProviderName;
  model: string;
  isFallback: boolean;
}

export class ModelRouter {
  private readonly breakers = new Map<ProviderName, BreakerState>();
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(
    private readonly providers: Map<ProviderName, AiProvider>,
    options: RouterOptions = {},
  ) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Run `execute` against each eligible attempt in order until one succeeds.
   * `onAttempt` is invoked for every try (ok or error) — the seam for the usage ledger.
   */
  async run<R>(
    route: TaskRoute,
    execute: (provider: AiProvider, attempt: RouteAttempt) => Promise<R>,
    onAttempt?: (info: { attempt: RouteAttempt; ok: boolean; error?: string; latencyMs: number }) => void,
  ): Promise<AttemptOutcome<R>> {
    const failures: { provider: ProviderName; model: string; error: string }[] = [];

    for (let i = 0; i < route.attempts.length; i += 1) {
      const attempt = route.attempts[i]!;
      const provider = this.providers.get(attempt.provider);

      if (!provider) {
        failures.push({ ...attempt, error: 'provider not registered' });
        continue;
      }
      if (this.isOpen(attempt.provider)) {
        failures.push({ ...attempt, error: 'circuit open' });
        continue;
      }

      const startedAt = this.now();
      try {
        const result = await execute(provider, attempt);
        this.recordSuccess(attempt.provider);
        onAttempt?.({ attempt, ok: true, latencyMs: this.now() - startedAt });
        return { result, provider: attempt.provider, model: attempt.model, isFallback: i > 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.recordFailure(attempt.provider);
        onAttempt?.({ attempt, ok: false, error: message, latencyMs: this.now() - startedAt });
        failures.push({ ...attempt, error: message });
      }
    }

    throw new AiUnavailableError(route.taskType, failures);
  }

  private isOpen(provider: ProviderName): boolean {
    const state = this.breakers.get(provider);
    if (!state) return false;
    if (state.openUntil > this.now()) return true;
    if (state.openUntil !== 0) {
      // cooldown elapsed → half-open: clear so the next call is allowed through.
      this.breakers.set(provider, { failures: 0, openUntil: 0 });
    }
    return false;
  }

  private recordSuccess(provider: ProviderName): void {
    this.breakers.set(provider, { failures: 0, openUntil: 0 });
  }

  private recordFailure(provider: ProviderName): void {
    const state = this.breakers.get(provider) ?? { failures: 0, openUntil: 0 };
    const failures = state.failures + 1;
    const openUntil = failures >= this.failureThreshold ? this.now() + this.cooldownMs : 0;
    this.breakers.set(provider, { failures, openUntil });
  }
}
