import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AiCallContext, AiCallRecord, AiTaskType } from '@radar/ai';
import type {
  UsageCompanyReport,
  UsageCompanySummaryReport,
  UsageCreditGrantSummary,
  UsageCreditMetric,
  UsageEventsFilter,
  UsageEventsReport,
  UsageLimitsReport,
  UsageLimitSummary,
  UsageMeReport,
  UsageModelBreakdown,
  UsageProviderBreakdown,
  UsageTaskBreakdown,
  UsageTaskType,
  UsageTeamReport,
  UsageTotals,
  UsageUserBreakdown,
} from '@radar/contracts';
import { RateLimitError } from '@radar/core';
import type { Database, ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { AiRateLimitService } from './ai-rate-limit.service';

type AiModelCatalogRow = Database['public']['Tables']['ai_model_catalog']['Row'];
type AiRequestRow = Database['public']['Tables']['ai_requests']['Row'];
type AiUsageEventRow = Database['public']['Tables']['ai_usage_events']['Row'];
type CompanyUsageLimitRow = Database['public']['Tables']['company_usage_limits']['Row'];
type UsageCreditGrantRow = Database['public']['Tables']['usage_credit_grants']['Row'];
type AiProviderRateLimitEventInsert =
  Database['public']['Tables']['ai_provider_rate_limit_events']['Insert'];

type TaskUsageCountKey =
  | 'opportunityAnalysisCount'
  | 'proposalGenerationCount'
  | 'companyResearchCount'
  | 'embeddingCount';
type TaskLimitSummaryKey =
  | 'opportunityAnalysis'
  | 'proposalGeneration'
  | 'companyResearch'
  | 'embedding';

interface TaskLimitPolicy {
  usageKey: TaskUsageCountKey;
  summaryKey: TaskLimitSummaryKey;
  grantMetric: UsageCreditMetric;
  label: string;
}

export interface UsagePeriodWindow {
  period: string;
  start: string;
  end: string;
  resetAt: string;
}

interface UsageContext {
  window: UsagePeriodWindow;
  row: CompanyUsageLimitRow | null;
  credits: UsageCreditGrantRow[];
  events: AiUsageEventRow[];
  companyUsage: UsageTotals;
  limits: UsageLimitSummary;
}

const TASK_LIMIT_POLICIES: Partial<Record<AiTaskType, TaskLimitPolicy>> = {
  opportunity_analyzer: {
    usageKey: 'opportunityAnalysisCount',
    summaryKey: 'opportunityAnalysis',
    grantMetric: 'opportunity_analysis',
    label: 'Opportunity analysis',
  },
  proposal_generator: {
    usageKey: 'proposalGenerationCount',
    summaryKey: 'proposalGeneration',
    grantMetric: 'proposal_generations',
    label: 'Proposal generation',
  },
  company_research: {
    usageKey: 'companyResearchCount',
    summaryKey: 'companyResearch',
    grantMetric: 'company_research',
    label: 'Company research',
  },
  embedding: {
    usageKey: 'embeddingCount',
    summaryKey: 'embedding',
    grantMetric: 'embeddings',
    label: 'Embedding',
  },
};

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toNumber(value: number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function emptyUsageTotals(): UsageTotals {
  return {
    requests: 0,
    tokens: 0,
    cost: 0,
    opportunityAnalysisCount: 0,
    proposalGenerationCount: 0,
    companyResearchCount: 0,
    embeddingCount: 0,
  };
}

function asUsageTaskType(value: string): UsageTaskType {
  return value as UsageTaskType;
}

function asDbProvider(
  provider: AiCallRecord['provider'],
): Database['public']['Enums']['ai_provider'] {
  return provider === 'fake' ? 'other' : provider;
}

function isActiveCreditGrant(grant: UsageCreditGrantRow, at: Date): boolean {
  return !grant.expires_at || new Date(grant.expires_at).getTime() > at.getTime();
}

function creditTotal(
  grants: UsageCreditGrantRow[],
  metric: UsageCreditMetric,
  at: Date,
): number {
  return roundCost(
    grants.reduce((sum, grant) => {
      if (grant.metric !== metric || !isActiveCreditGrant(grant, at)) {
        return sum;
      }
      return sum + toNumber(grant.amount);
    }, 0),
  );
}

function metricLimit(limit: number | null, credit: number, used: number) {
  const effectiveLimit = limit == null ? null : roundCost(limit + credit);
  const remaining = effectiveLimit == null ? null : roundCost(Math.max(0, effectiveLimit - used));
  return {
    limit,
    credit,
    effectiveLimit,
    used: roundCost(used),
    remaining,
    exceeded: effectiveLimit != null && used >= effectiveLimit,
  };
}

export function resolveUsagePeriodWindow(period?: string, now = new Date()): UsagePeriodWindow {
  const year = period ? Number(period.slice(0, 4)) : now.getUTCFullYear();
  const monthIndex = period ? Number(period.slice(5, 7)) : now.getUTCMonth() + 1;

  const start = new Date(Date.UTC(year, monthIndex - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));

  return {
    period: `${year.toString().padStart(4, '0')}-${monthIndex.toString().padStart(2, '0')}`,
    start: start.toISOString(),
    end: end.toISOString(),
    resetAt: end.toISOString(),
  };
}

export function buildUsageTotals(
  events: Array<
    Pick<
      AiUsageEventRow,
      'task_type' | 'total_tokens' | 'input_tokens' | 'output_tokens' | 'estimated_cost'
    >
  >,
): UsageTotals {
  const totals = emptyUsageTotals();

  for (const event of events) {
    totals.requests += 1;
    totals.tokens += toNumber(event.total_tokens) || toNumber(event.input_tokens) + toNumber(event.output_tokens);
    totals.cost = roundCost(totals.cost + toNumber(event.estimated_cost));

    switch (event.task_type) {
      case 'opportunity_analyzer':
        totals.opportunityAnalysisCount += 1;
        break;
      case 'proposal_generator':
        totals.proposalGenerationCount += 1;
        break;
      case 'company_research':
        totals.companyResearchCount += 1;
        break;
      case 'embedding':
        totals.embeddingCount += 1;
        break;
      default:
        break;
    }
  }

  return totals;
}

function mergeCompanyUsage(
  row: CompanyUsageLimitRow | null,
  derived: UsageTotals,
): UsageTotals {
  if (!row) return derived;
  return {
    ...derived,
    requests: toNumber(row.used_requests),
    tokens: toNumber(row.used_tokens),
    cost: roundCost(toNumber(row.used_cost)),
  };
}

export function buildUsageLimitSummary(
  window: UsagePeriodWindow,
  row: CompanyUsageLimitRow | null,
  credits: UsageCreditGrantRow[],
  usage: UsageTotals,
  at = new Date(),
): UsageLimitSummary {
  return {
    period: window.period,
    resetAt: row?.reset_at ?? window.resetAt,
    requests: metricLimit(row?.ai_requests_limit ?? null, creditTotal(credits, 'ai_requests', at), usage.requests),
    tokens: metricLimit(row?.ai_tokens_limit ?? null, creditTotal(credits, 'ai_tokens', at), usage.tokens),
    cost: metricLimit(row?.ai_cost_limit ?? null, creditTotal(credits, 'ai_cost_usd', at), usage.cost),
    opportunityAnalysis: metricLimit(
      row?.opportunity_analysis_limit ?? null,
      creditTotal(credits, 'opportunity_analysis', at),
      usage.opportunityAnalysisCount,
    ),
    proposalGeneration: metricLimit(
      row?.proposal_generation_limit ?? null,
      creditTotal(credits, 'proposal_generations', at),
      usage.proposalGenerationCount,
    ),
    companyResearch: metricLimit(
      row?.company_research_limit ?? null,
      creditTotal(credits, 'company_research', at),
      usage.companyResearchCount,
    ),
    embedding: metricLimit(
      row?.embedding_limit ?? null,
      creditTotal(credits, 'embeddings', at),
      usage.embeddingCount,
    ),
  };
}

function usageSort(a: { requests: number; tokens: number; cost: number }, b: { requests: number; tokens: number; cost: number }): number {
  if (b.cost !== a.cost) return b.cost - a.cost;
  if (b.tokens !== a.tokens) return b.tokens - a.tokens;
  return b.requests - a.requests;
}

function userBreakdowns(events: AiUsageEventRow[]): UsageUserBreakdown[] {
  const byUser = new Map<string | null, UsageUserBreakdown>();

  for (const event of events) {
    const current = byUser.get(event.user_id) ?? {
      userId: event.user_id,
      requests: 0,
      tokens: 0,
      cost: 0,
    };
    current.requests += 1;
    current.tokens += toNumber(event.total_tokens);
    current.cost = roundCost(current.cost + toNumber(event.estimated_cost));
    byUser.set(event.user_id, current);
  }

  return [...byUser.values()].sort(usageSort);
}

function taskBreakdowns(events: AiUsageEventRow[]): UsageTaskBreakdown[] {
  const byTask = new Map<UsageTaskType, UsageTaskBreakdown>();

  for (const event of events) {
    const taskType = asUsageTaskType(event.task_type);
    const current = byTask.get(taskType) ?? {
      taskType,
      requests: 0,
      tokens: 0,
      cost: 0,
    };
    current.requests += 1;
    current.tokens += toNumber(event.total_tokens);
    current.cost = roundCost(current.cost + toNumber(event.estimated_cost));
    byTask.set(taskType, current);
  }

  return [...byTask.values()].sort(usageSort);
}

function modelBreakdowns(events: AiUsageEventRow[]): UsageModelBreakdown[] {
  const byModel = new Map<string, UsageModelBreakdown>();

  for (const event of events) {
    const key = `${event.provider}:${event.model}`;
    const current = byModel.get(key) ?? {
      provider: event.provider,
      model: event.model,
      requests: 0,
      tokens: 0,
      cost: 0,
    };
    current.requests += 1;
    current.tokens += toNumber(event.total_tokens);
    current.cost = roundCost(current.cost + toNumber(event.estimated_cost));
    byModel.set(key, current);
  }

  return [...byModel.values()].sort(usageSort);
}

function providerBreakdowns(events: AiUsageEventRow[]): UsageProviderBreakdown[] {
  const byProvider = new Map<string, UsageProviderBreakdown>();

  for (const event of events) {
    const current = byProvider.get(event.provider) ?? {
      provider: event.provider,
      requests: 0,
      tokens: 0,
      cost: 0,
    };
    current.requests += 1;
    current.tokens += toNumber(event.total_tokens);
    current.cost = roundCost(current.cost + toNumber(event.estimated_cost));
    byProvider.set(event.provider, current);
  }

  return [...byProvider.values()].sort(usageSort);
}

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    private readonly rateLimits: AiRateLimitService,
  ) {}

  async assertWithinUsageLimits(ctx: AiCallContext): Promise<void> {
    const window = resolveUsagePeriodWindow();
    const [row, credits, taskUsageCount] = await Promise.all([
      this.ensureCompanyUsageLimitRow(ctx.organizationId, window),
      this.listCreditGrants(ctx.organizationId),
      this.countTaskUsage(ctx.organizationId, window, ctx.taskType),
    ]);

    const usage = emptyUsageTotals();
    usage.requests = toNumber(row.used_requests);
    usage.tokens = toNumber(row.used_tokens);
    usage.cost = roundCost(toNumber(row.used_cost));

    const taskPolicy = TASK_LIMIT_POLICIES[ctx.taskType];
    if (taskPolicy) {
      usage[taskPolicy.usageKey] = taskUsageCount;
    }

    const limits = buildUsageLimitSummary(window, row, credits, usage);
    if (limits.requests.exceeded) {
      throw new RateLimitError('AI request quota exceeded', {
        metric: 'ai_requests',
        period: window.period,
        resetAt: limits.resetAt,
        limit: limits.requests,
      });
    }
    if (limits.tokens.exceeded) {
      throw new RateLimitError('AI token quota exceeded', {
        metric: 'ai_tokens',
        period: window.period,
        resetAt: limits.resetAt,
        limit: limits.tokens,
      });
    }
    if (limits.cost.exceeded) {
      throw new RateLimitError('AI cost quota exceeded', {
        metric: 'ai_cost_usd',
        period: window.period,
        resetAt: limits.resetAt,
        limit: limits.cost,
      });
    }

    if (taskPolicy) {
      const taskLimit = limits[taskPolicy.summaryKey];
      if (taskLimit.exceeded) {
        throw new RateLimitError(`${taskPolicy.label} quota exceeded`, {
          metric: taskPolicy.grantMetric,
          period: window.period,
          resetAt: limits.resetAt,
          limit: taskLimit,
        });
      }
    }

    await this.rateLimits.assertWithinOrganizationRateLimit(ctx, row);
  }

  async recordCall(record: AiCallRecord): Promise<void> {
    try {
      await this.persistCallRecord(record);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      this.logger.error(
        `Failed to persist AI usage for ${record.organizationId}/${record.taskType}/${record.provider}/${record.model}: ${message}`,
      );
    }
  }

  async getMeReport(
    organizationId: string,
    userId: string,
    period?: string,
  ): Promise<UsageMeReport> {
    const context = await this.loadUsageContext(organizationId, period);
    const userEvents = context.events.filter((event) => event.user_id === userId);

    return {
      userId,
      period: context.window.period,
      totals: buildUsageTotals(userEvents),
      limits: context.limits,
      byTask: taskBreakdowns(userEvents),
    };
  }

  async getCompanyReport(
    organizationId: string,
    period?: string,
  ): Promise<UsageCompanyReport> {
    const context = await this.loadUsageContext(organizationId, period);

    return {
      period: context.window.period,
      totals: context.companyUsage,
      limits: context.limits,
      byUser: userBreakdowns(context.events),
      byTask: taskBreakdowns(context.events),
      byModel: modelBreakdowns(context.events),
      byProvider: providerBreakdowns(context.events),
    };
  }

  async getCompanySummary(
    organizationId: string,
    period?: string,
  ): Promise<UsageCompanySummaryReport> {
    const context = await this.loadUsageContext(organizationId, period);

    return {
      period: context.window.period,
      totals: context.companyUsage,
      limits: context.limits,
      byTask: taskBreakdowns(context.events),
      byModel: modelBreakdowns(context.events),
    };
  }

  async getTeamReport(
    organizationId: string,
    period?: string,
  ): Promise<UsageTeamReport> {
    const context = await this.loadUsageContext(organizationId, period);

    return {
      period: context.window.period,
      members: userBreakdowns(context.events),
    };
  }

  async getLimitsReport(
    organizationId: string,
    period?: string,
  ): Promise<UsageLimitsReport> {
    const context = await this.loadUsageContext(organizationId, period);
    const activeCredits = context.credits.filter((grant) => isActiveCreditGrant(grant, new Date()));

    return {
      period: context.window.period,
      limits: context.limits,
      credits: activeCredits.map((grant): UsageCreditGrantSummary => ({
        id: grant.id,
        metric: grant.metric,
        amount: roundCost(toNumber(grant.amount)),
        reason: grant.reason,
        expiresAt: grant.expires_at,
        createdAt: grant.created_at,
        grantedBy: grant.granted_by,
      })),
    };
  }

  async listEvents(
    organizationId: string,
    filter: UsageEventsFilter,
  ): Promise<UsageEventsReport> {
    let query = this.supabase
      .from('ai_usage_events')
      .select(
        'id, user_id, provider, model, task_type, ai_request_id, api_key_id, provider_account_id, input_tokens, output_tokens, total_tokens, estimated_cost, is_free_tier, status, created_at',
        { count: 'exact' },
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (filter.period) {
      const window = resolveUsagePeriodWindow(filter.period);
      query = query.gte('created_at', window.start).lt('created_at', window.end);
    } else if (!filter.dateFrom && !filter.dateTo) {
      const window = resolveUsagePeriodWindow();
      query = query.gte('created_at', window.start).lt('created_at', window.end);
    }

    if (filter.dateFrom) {
      query = query.gte('created_at', filter.dateFrom);
    }
    if (filter.dateTo) {
      query = query.lte('created_at', filter.dateTo);
    }
    if (filter.userId) {
      query = query.eq('user_id', filter.userId);
    }
    if (filter.taskType) {
      query = query.eq('task_type', filter.taskType);
    }
    if (filter.provider) {
      query = query.eq('provider', filter.provider);
    }
    if (filter.model) {
      query = query.eq('model', filter.model);
    }
    if (filter.status) {
      query = query.eq('status', filter.status);
    }

    const from = (filter.page - 1) * filter.pageSize;
    const to = from + filter.pageSize - 1;
    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw new Error(`Failed to load AI usage events: ${error.message}`);
    }

    return {
      items: ((data ?? []) as AiUsageEventRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        model: row.model,
        taskType: asUsageTaskType(row.task_type),
        aiRequestId: row.ai_request_id,
        apiKeyId: row.api_key_id,
        providerAccountId: row.provider_account_id,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalTokens: row.total_tokens,
        estimatedCost: roundCost(toNumber(row.estimated_cost)),
        isFreeTier: row.is_free_tier,
        status: row.status,
        createdAt: row.created_at,
      })),
      total: count ?? 0,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  private async loadUsageContext(
    organizationId: string,
    period?: string,
  ): Promise<UsageContext> {
    const window = resolveUsagePeriodWindow(period);
    const [row, credits, events] = await Promise.all([
      this.loadCompanyUsageLimitRow(organizationId, window.period),
      this.listCreditGrants(organizationId),
      this.listPeriodEvents(organizationId, window),
    ]);

    const companyUsage = mergeCompanyUsage(row, buildUsageTotals(events));

    return {
      window,
      row,
      credits,
      events,
      companyUsage,
      limits: buildUsageLimitSummary(window, row, credits, companyUsage),
    };
  }

  private async persistCallRecord(record: AiCallRecord): Promise<void> {
    const window = resolveUsagePeriodWindow();
    const totalTokens = record.inputTokens + record.outputTokens;
    const model = await this.loadModelCatalog(record.provider, record.model);
    const estimatedCost = record.status === 'error'
      ? 0
      : roundCost(
          (record.inputTokens * toNumber(model?.input_cost_per_mtok)) / 1_000_000 +
            (record.outputTokens * toNumber(model?.output_cost_per_mtok)) / 1_000_000,
        );
    const isFreeTier = record.isFreeTier ?? model?.is_free_tier ?? false;
    const requestId = await this.insertAiRequest(record, estimatedCost, isFreeTier);

    if (record.status !== 'error') {
      await this.insertUsageEvent(requestId, record, totalTokens, estimatedCost, isFreeTier);
      await Promise.all([
        this.bumpCompanyUsage(record.organizationId, window, totalTokens, estimatedCost),
        this.bumpApiKeyUsage(record, totalTokens, estimatedCost),
        this.bumpProviderAccountUsage(record.providerAccountId, estimatedCost),
      ]);
      return;
    }

    await this.bumpApiKeyUsage(record, 0, 0);
    if (record.isRateLimitError) {
      await Promise.all([
        this.insertProviderRateLimitEvent(record),
        this.applyApiKeyCooldown(record),
      ]);
    }
  }

  private async insertAiRequest(
    record: AiCallRecord,
    estimatedCost: number,
    isFreeTier: boolean,
  ): Promise<string> {
    const payload: Database['public']['Tables']['ai_requests']['Insert'] = {
      organization_id: record.organizationId,
      user_id: record.userId,
      task_type: record.taskType,
      provider: asDbProvider(record.provider),
      model: record.model,
      ai_prompt_version_id: record.aiPromptVersionId ?? null,
      input_tokens: record.inputTokens,
      output_tokens: record.outputTokens,
      cost_usd: estimatedCost,
      latency_ms: record.latencyMs,
      status: record.status,
      error: record.error ?? null,
      request_ref: {},
      api_key_id: record.apiKeyId ?? null,
      provider_account_id: record.providerAccountId ?? null,
      is_free_tier: isFreeTier,
    };

    const { data, error } = await this.supabase
      .from('ai_requests')
      .insert(payload)
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to insert ai_requests row: ${error?.message ?? 'unknown error'}`);
    }

    return (data as Pick<AiRequestRow, 'id'>).id;
  }

  private async insertUsageEvent(
    requestId: string,
    record: AiCallRecord,
    totalTokens: number,
    estimatedCost: number,
    isFreeTier: boolean,
  ): Promise<void> {
    const payload: Database['public']['Tables']['ai_usage_events']['Insert'] = {
      organization_id: record.organizationId,
      user_id: record.userId,
      provider: asDbProvider(record.provider),
      model: record.model,
      task_type: record.taskType,
      ai_request_id: requestId,
      api_key_id: record.apiKeyId ?? null,
      provider_account_id: record.providerAccountId ?? null,
      input_tokens: record.inputTokens,
      output_tokens: record.outputTokens,
      total_tokens: totalTokens,
      estimated_cost: estimatedCost,
      is_free_tier: isFreeTier,
      status: record.status,
    };

    const { error } = await this.supabase.from('ai_usage_events').insert(payload);
    if (error) {
      throw new Error(`Failed to insert ai_usage_events row: ${error.message}`);
    }
  }

  private async bumpCompanyUsage(
    organizationId: string,
    window: UsagePeriodWindow,
    totalTokens: number,
    estimatedCost: number,
  ): Promise<void> {
    const row = await this.ensureCompanyUsageLimitRow(organizationId, window);
    const { error } = await this.supabase
      .from('company_usage_limits')
      .update({
        used_requests: toNumber(row.used_requests) + 1,
        used_tokens: toNumber(row.used_tokens) + totalTokens,
        used_cost: roundCost(toNumber(row.used_cost) + estimatedCost),
      })
      .eq('id', row.id);

    if (error) {
      throw new Error(`Failed to update company_usage_limits for ${organizationId}: ${error.message}`);
    }
  }

  private async bumpApiKeyUsage(
    record: AiCallRecord,
    totalTokens: number,
    estimatedCost: number,
  ): Promise<void> {
    if (!record.apiKeyId) return;

    const { data, error } = await this.supabase
      .from('ai_api_keys')
      .select('id, requests_used_today, tokens_used_month, cost_used_month')
      .eq('id', record.apiKeyId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load ai_api_keys row ${record.apiKeyId}: ${error.message}`);
    }
    if (!data) return;

    const patch: Database['public']['Tables']['ai_api_keys']['Update'] = {
      last_used_at: new Date().toISOString(),
      last_error: record.status === 'error' ? record.error ?? 'AI provider call failed' : null,
    };

    if (record.status !== 'error') {
      patch.status = 'active';
      patch.cooldown_until = null;
      patch.requests_used_today = toNumber(data.requests_used_today) + 1;
      patch.tokens_used_month = toNumber(data.tokens_used_month) + totalTokens;
      patch.cost_used_month = roundCost(toNumber(data.cost_used_month) + estimatedCost);
    }

    const { error: updateError } = await this.supabase
      .from('ai_api_keys')
      .update(patch)
      .eq('id', record.apiKeyId);

    if (updateError) {
      throw new Error(`Failed to update ai_api_keys row ${record.apiKeyId}: ${updateError.message}`);
    }
  }

  private async bumpProviderAccountUsage(
    providerAccountId: string | undefined,
    estimatedCost: number,
  ): Promise<void> {
    if (!providerAccountId) return;

    const { data, error } = await this.supabase
      .from('ai_provider_accounts')
      .select('id, monthly_usage')
      .eq('id', providerAccountId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load ai_provider_accounts row ${providerAccountId}: ${error.message}`);
    }
    if (!data) return;

    const { error: updateError } = await this.supabase
      .from('ai_provider_accounts')
      .update({
        monthly_usage: roundCost(toNumber(data.monthly_usage) + estimatedCost),
      })
      .eq('id', providerAccountId);

    if (updateError) {
      throw new Error(`Failed to update ai_provider_accounts row ${providerAccountId}: ${updateError.message}`);
    }
  }

  private async loadModelCatalog(
    provider: AiCallRecord['provider'],
    model: string,
  ): Promise<Pick<AiModelCatalogRow, 'input_cost_per_mtok' | 'output_cost_per_mtok' | 'is_free_tier'> | null> {
    const { data, error } = await this.supabase
      .from('ai_model_catalog')
      .select('input_cost_per_mtok, output_cost_per_mtok, is_free_tier')
      .eq('provider', asDbProvider(provider))
      .eq('model', model)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load ai_model_catalog for ${provider}/${model}: ${error.message}`);
    }

    return (data as Pick<
      AiModelCatalogRow,
      'input_cost_per_mtok' | 'output_cost_per_mtok' | 'is_free_tier'
    > | null) ?? null;
  }

  private async countTaskUsage(
    organizationId: string,
    window: UsagePeriodWindow,
    taskType: AiTaskType,
  ): Promise<number> {
    const { count, error } = await this.supabase
      .from('ai_usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('task_type', taskType)
      .gte('created_at', window.start)
      .lt('created_at', window.end);

    if (error) {
      throw new Error(`Failed to count ${taskType} usage for ${organizationId}: ${error.message}`);
    }

    return count ?? 0;
  }

  private async ensureCompanyUsageLimitRow(
    organizationId: string,
    window: UsagePeriodWindow,
  ): Promise<CompanyUsageLimitRow> {
    const existing = await this.loadCompanyUsageLimitRow(organizationId, window.period);
    if (existing) return existing;

    const { data, error } = await this.supabase
      .from('company_usage_limits')
      .insert({
        organization_id: organizationId,
        period: window.period,
        reset_at: window.resetAt,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        const retry = await this.loadCompanyUsageLimitRow(organizationId, window.period);
        if (retry) return retry;
      }
      throw new Error(`Failed to ensure company_usage_limits row for ${organizationId}: ${error.message}`);
    }

    return data as CompanyUsageLimitRow;
  }

  private async loadCompanyUsageLimitRow(
    organizationId: string,
    period: string,
  ): Promise<CompanyUsageLimitRow | null> {
    const { data, error } = await this.supabase
      .from('company_usage_limits')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('period', period)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load company_usage_limits for ${organizationId}/${period}: ${error.message}`);
    }

    return (data as CompanyUsageLimitRow | null) ?? null;
  }

  private async listCreditGrants(
    organizationId: string,
  ): Promise<UsageCreditGrantRow[]> {
    const { data, error } = await this.supabase
      .from('usage_credit_grants')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load usage_credit_grants for ${organizationId}: ${error.message}`);
    }

    return (data ?? []) as UsageCreditGrantRow[];
  }

  private async listPeriodEvents(
    organizationId: string,
    window: UsagePeriodWindow,
  ): Promise<AiUsageEventRow[]> {
    const { data, error } = await this.supabase
      .from('ai_usage_events')
      .select(
        'id, user_id, provider, model, task_type, ai_request_id, api_key_id, provider_account_id, input_tokens, output_tokens, total_tokens, estimated_cost, is_free_tier, status, created_at',
      )
      .eq('organization_id', organizationId)
      .gte('created_at', window.start)
      .lt('created_at', window.end);

    if (error) {
      throw new Error(`Failed to load ai_usage_events for ${organizationId}/${window.period}: ${error.message}`);
    }

    return (data ?? []) as AiUsageEventRow[];
  }

  private async insertProviderRateLimitEvent(record: AiCallRecord): Promise<void> {
    if (record.provider === 'fake') return;

    const payload: AiProviderRateLimitEventInsert = {
      provider: asDbProvider(record.provider),
      provider_account_id: record.providerAccountId ?? null,
      api_key_id: record.apiKeyId ?? null,
      task_type: record.taskType,
      limit_type: 'rpm',
      retry_after_seconds: record.retryAfterSeconds ?? null,
      detail: {
        error: record.error ?? null,
        statusCode: record.providerStatusCode ?? null,
        organizationId: record.organizationId,
        model: record.model,
      },
    };

    const { error } = await this.supabase.from('ai_provider_rate_limit_events').insert(payload);
    if (error) {
      throw new Error(`Failed to insert ai_provider_rate_limit_events row: ${error.message}`);
    }
  }

  private async applyApiKeyCooldown(record: AiCallRecord): Promise<void> {
    if (!record.apiKeyId) return;

    const cooldownSeconds = this.rateLimits.providerCooldownSeconds(record.retryAfterSeconds);
    const cooldownUntil = new Date(Date.now() + cooldownSeconds * 1000).toISOString();
    const { error } = await this.supabase
      .from('ai_api_keys')
      .update({
        status: 'cooldown',
        cooldown_until: cooldownUntil,
        last_used_at: new Date().toISOString(),
        last_error: record.error ?? 'AI provider rate limited',
      })
      .eq('id', record.apiKeyId);

    if (error) {
      throw new Error(`Failed to cooldown ai_api_keys row ${record.apiKeyId}: ${error.message}`);
    }
  }
}
