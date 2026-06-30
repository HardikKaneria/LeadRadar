/**
 * AIService — the single entry point the domain uses. Resolves the active route for a task type,
 * runs it through the free-first ModelRouter, validates structured output (one repair pass), and
 * emits a usage record per provider call. The DB-backed key pool + `ai_task_routes` + usage
 * ledger persistence (P3-12/13/14) plug into the constructor (routes) and `hooks.onCall`.
 */

import { DEFAULT_TASK_ROUTES } from './routes';
import { ProviderHttpError } from './providers/http';
import { ModelRouter, type RouterOptions } from './router';
import {
  AiSchemaError,
  type AiCallContext,
  type AiProvider,
  type AiServiceHooks,
  type AiTaskType,
  type EmbedInput,
  type EmbedResult,
  type GenerateInput,
  type GenerateResult,
  type PromptResolver,
  type ProviderName,
  type ResolvedPrompt,
  type StructuredInput,
  type TaskRoute,
  type AiPrivacyMode,
} from './types';
import { redactPii } from './redact';

export interface AIServiceOptions {
  providers: AiProvider[];
  /** Override the in-code defaults (e.g. from `ai_task_routes`). Partial — falls back to defaults. */
  routes?: Partial<Record<AiTaskType, TaskRoute>>;
  hooks?: AiServiceHooks;
  router?: RouterOptions;
  /** Resolves the active prompt version (`ai_prompt_versions`) per call; stamped onto every record (P3-03). */
  resolvePrompt?: PromptResolver;
  /** Injectable clock (tests). */
  now?: () => number;
  privacyMode?: AiPrivacyMode;
}

/** Strip ```json fences and parse. Throws on invalid JSON. */
function parseJsonLoose(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

export class AIService {
  private readonly providers: Map<ProviderName, AiProvider>;
  private readonly router: ModelRouter;
  private readonly routes: Record<AiTaskType, TaskRoute>;
  private readonly hooks: AiServiceHooks;
  private readonly resolvePrompt?: PromptResolver;
  private readonly now: () => number;
  private readonly privacyMode?: AiPrivacyMode;

  constructor(options: AIServiceOptions) {
    this.providers = new Map(options.providers.map((p) => [p.name, p]));
    this.router = new ModelRouter(this.providers, options.router);
    this.routes = { ...DEFAULT_TASK_ROUTES, ...(options.routes ?? {}) };
    this.hooks = options.hooks ?? {};
    this.resolvePrompt = options.resolvePrompt;
    this.now = options.now ?? (() => Date.now());
    this.privacyMode = options.privacyMode;
  }

  private async resolvePromptFor(ctx: AiCallContext): Promise<ResolvedPrompt | null> {
    return (await this.resolvePrompt?.(ctx)) ?? null;
  }

  private routeFor(taskType: AiTaskType): TaskRoute {
    const route = this.routes[taskType];
    if (!route || route.attempts.length === 0) {
      throw new Error(`No active AI route configured for task "${taskType}"`);
    }
    return route;
  }

  private async runBeforeCall(ctx: AiCallContext): Promise<void> {
    await this.hooks.beforeCall?.(ctx);
  }

  private async emitCall(record: Parameters<NonNullable<AiServiceHooks['onCall']>>[0]): Promise<void> {
    try {
      await this.hooks.onCall?.(record);
    } catch {
      // Usage/audit hooks should never change the provider outcome.
    }
  }

  private errorRecordPatch(error: unknown) {
    if (!(error instanceof ProviderHttpError)) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      error: error.message,
      isRateLimitError: error.status === 429,
      providerStatusCode: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }

  /** Free-form text generation through the free-first route. */
  async generate(ctx: AiCallContext, input: GenerateInput): Promise<GenerateResult> {
    const route = this.routeFor(ctx.taskType);
    await this.runBeforeCall(ctx);
    const prompt = await this.resolvePromptFor(ctx);
    const promptVersionId = prompt?.promptVersionId;

    const outcome = await this.router.run(route, async (provider, attempt) => {
      const isFallbackAttempt =
        route.attempts[0]?.provider !== attempt.provider || route.attempts[0]?.model !== attempt.model;
      const startedAt = this.now();
      try {
        let finalSystem = input.system ?? prompt?.system;
        let finalPrompt = input.prompt;

        if (this.privacyMode === 'redact_pii_before_ai') {
          finalSystem = finalSystem ? redactPii(finalSystem) : undefined;
          finalPrompt = redactPii(finalPrompt) || finalPrompt;
        }

        const res = await provider.complete({
          taskType: ctx.taskType,
          model: attempt.model,
          system: finalSystem,
          prompt: finalPrompt,
          maxTokens: input.maxTokens ?? route.maxOutputTokens,
          temperature: input.temperature ?? route.temperature,
          privacyMode: this.privacyMode,
        });
        await this.emitCall({
          taskType: ctx.taskType,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          provider: attempt.provider,
          model: attempt.model,
          status: isFallbackAttempt ? 'fallback' : 'ok',
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          latencyMs: this.now() - startedAt,
          aiPromptVersionId: promptVersionId,
          apiKeyId: res.apiKeyId,
          providerAccountId: res.providerAccountId,
          isFreeTier: res.isFreeTier,
        });
        return res;
      } catch (error) {
        await this.emitCall({
          taskType: ctx.taskType,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          provider: attempt.provider,
          model: attempt.model,
          status: 'error',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: this.now() - startedAt,
          aiPromptVersionId: promptVersionId,
          ...this.errorRecordPatch(error),
        });
        throw error;
      }
    });

    return {
      text: outcome.result.text,
      provider: outcome.provider,
      model: outcome.model,
      inputTokens: outcome.result.inputTokens,
      outputTokens: outcome.result.outputTokens,
      apiKeyId: outcome.result.apiKeyId,
      providerAccountId: outcome.result.providerAccountId,
      isFreeTier: outcome.result.isFreeTier,
    };
  }

  /** Schema-validated JSON. One repair pass before failing with AiSchemaError. */
  async generateStructured<T>(ctx: AiCallContext, input: StructuredInput<T>): Promise<T> {
    const first = await this.generate(ctx, input);
    try {
      return input.parse(parseJsonLoose(first.text));
    } catch (firstError) {
      const reason = firstError instanceof Error ? firstError.message : String(firstError);
      const repaired = await this.generate(ctx, {
        ...input,
        prompt: `${input.prompt}\n\nYour previous response could not be parsed (${reason}). Respond again with ONLY valid JSON that satisfies the schema — no prose, no markdown fences.`,
      });
      try {
        return input.parse(parseJsonLoose(repaired.text));
      } catch (secondError) {
        throw new AiSchemaError(input.schemaName, secondError instanceof Error ? secondError.message : String(secondError));
      }
    }
  }

  /** Vector embedding through the embedding route. */
  async embed(ctx: AiCallContext, input: EmbedInput): Promise<EmbedResult> {
    const route = this.routeFor(ctx.taskType);
    await this.runBeforeCall(ctx);
    const promptVersionId = (await this.resolvePromptFor(ctx))?.promptVersionId;

    const outcome = await this.router.run(route, async (provider, attempt) => {
      if (!provider.embed) throw new Error(`provider "${provider.name}" does not support embeddings`);
      const isFallbackAttempt =
        route.attempts[0]?.provider !== attempt.provider || route.attempts[0]?.model !== attempt.model;
      const startedAt = this.now();
      try {
        let finalInput = input.input;
        if (this.privacyMode === 'redact_pii_before_ai') {
          finalInput = redactPii(finalInput) || finalInput;
        }

        const res = await provider.embed({ taskType: ctx.taskType, model: attempt.model, input: finalInput, privacyMode: this.privacyMode });
        await this.emitCall({
          taskType: ctx.taskType,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          provider: attempt.provider,
          model: attempt.model,
          status: isFallbackAttempt ? 'fallback' : 'ok',
          inputTokens: res.inputTokens,
          outputTokens: 0,
          latencyMs: this.now() - startedAt,
          aiPromptVersionId: promptVersionId,
          apiKeyId: res.apiKeyId,
          providerAccountId: res.providerAccountId,
          isFreeTier: res.isFreeTier,
        });
        return res;
      } catch (error) {
        await this.emitCall({
          taskType: ctx.taskType,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          provider: attempt.provider,
          model: attempt.model,
          status: 'error',
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: this.now() - startedAt,
          aiPromptVersionId: promptVersionId,
          ...this.errorRecordPatch(error),
        });
        throw error;
      }
    });

    return {
      vector: outcome.result.vector,
      provider: outcome.provider,
      model: outcome.model,
      inputTokens: outcome.result.inputTokens,
      apiKeyId: outcome.result.apiKeyId,
      providerAccountId: outcome.result.providerAccountId,
      isFreeTier: outcome.result.isFreeTier,
    };
  }
}
