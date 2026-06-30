import { Inject, Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { ExternalCostBreakdown } from '@radar/contracts';
import type { ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import type {
  ExternalCostRuleRow,
  ExternalOptionCostMultiplierRow,
  ExternalProviderPlanProfileRow,
  ExternalProviderTaskType,
  ExternalProviderUnitType,
  ExternalUsageMetrics,
} from './external-provider.types';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

type JsonRecord = Record<string, unknown>;

interface LegacyCostRule {
  unit_type?: ExternalProviderUnitType | string;
  bill_on?: 'success' | 'request' | 'provider_reported' | 'failed_request';
  units_per_success?: number;
  units_per_record?: number;
  units_per_page?: number;
  units_per_request?: number;
  units_per_search?: number;
  provider_cost_field?: string;
  fallback_estimated_cost_usd?: number;
  estimated_units?: number;
  option_multipliers?: Record<string, number>;
}

export interface ProviderPeriodWindow {
  periodType: 'daily' | 'weekly' | 'monthly' | 'trial' | 'custom';
  start: string;
  end: string;
  nextResetAt: string | null;
}

export interface UsageHistoryPoint {
  timestamp: string;
  usedUnits: number;
}

export interface FreeTierApplication {
  freeUnitsApplied: number;
  paidUnitsApplied: number;
  paidCostUsd: number;
}

interface PreCallParams {
  provider: string;
  taskType: ExternalProviderTaskType;
  endpointKey?: string | null;
  datasetKey?: string | null;
  actorKey?: string | null;
  planProfileId?: string | null;
  accountId?: string | null;
  expectedRequests?: number;
  expectedRecords?: number;
  expectedSuccessfulRecords?: number;
  expectedPages?: number;
  expectedResults?: number;
  expectedBrowserMinutes?: number;
  expectedMb?: number;
  optionsJson?: Record<string, unknown>;
  overageUnitPrice?: number;
  remainingFreeUnits?: number;
}

interface PostCallParams {
  provider: string;
  taskType: ExternalProviderTaskType;
  endpointKey?: string | null;
  datasetKey?: string | null;
  actorKey?: string | null;
  providerResponse: unknown;
  costRule: ExternalCostRuleRow | null;
  optionMultipliers: ExternalOptionCostMultiplierRow[];
  planProfile: ExternalProviderPlanProfileRow | null;
  remainingFreeUnits?: number;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getByPath(record: JsonRecord | null, path?: string): unknown {
  if (!record || !path) return undefined;
  return path.split('.').reduce<unknown>((value, segment) => {
    if (typeof value === 'object' && value !== null && segment in (value as JsonRecord)) {
      return (value as JsonRecord)[segment];
    }
    return undefined;
  }, record);
}

function inferCount(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    for (const key of ['count', 'total', 'records', 'items', 'results', 'pages', 'matches']) {
      if (key in record) {
        const nested = record[key];
        if (Array.isArray(nested)) return nested.length;
        const numeric = asFiniteNumber(nested);
        if (numeric != null) return numeric;
      }
    }
  }
  return asFiniteNumber(value);
}

function normalizeRuleUnitType(
  unitType: string | undefined,
  fallback: ExternalProviderUnitType,
): ExternalProviderUnitType {
  const supported: ExternalProviderUnitType[] = [
    'request', 'record', 'credit', 'usd_credit', 'search', 'page', 'token',
    'compute_unit', 'api_credit', 'successful_record', 'failed_request', 'result',
    'browser_minute', 'data_transfer_mb', 'provider_reported', 'custom',
  ];
  return supported.includes(unitType as ExternalProviderUnitType)
    ? (unitType as ExternalProviderUnitType)
    : fallback;
}

function roundUnits(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

const EMPTY_EXTENDED: Pick<
  ExternalUsageMetrics,
  | 'successfulRecordCount' | 'failedRecordCount' | 'resultCount' | 'browserMinutes' | 'dataMb'
  | 'baseUnits' | 'multiplierTotal' | 'finalUnits' | 'billableUnits' | 'unitPriceUsd'
  | 'calculatedCostUsd' | 'providerReportedUnits' | 'providerReportedCostUsd'
  | 'costSource' | 'costRuleId' | 'costBreakdownJson'
> = {
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

@Injectable()
export class ExternalCostCalculatorService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  // ── DB-backed rule resolution ─────────────────────────────────────────────

  async resolveActiveCostRule(
    provider: string,
    taskType: ExternalProviderTaskType,
    endpointKey?: string | null,
    datasetKey?: string | null,
    actorKey?: string | null,
    _planProfileId?: string | null,
    _accountId?: string | null,
  ): Promise<ExternalCostRuleRow | null> {
    const { data, error } = await this.supabase
      .from('external_cost_rules')
      .select('*')
      .eq('provider', provider)
      .eq('is_active', true)
      .or(
        [
          `rule_scope.eq.provider_default`,
          taskType ? `and(rule_scope.eq.task_type,task_type.eq.${taskType})` : '',
          datasetKey ? `and(rule_scope.eq.dataset,dataset_key.eq.${datasetKey})` : '',
          actorKey ? `and(rule_scope.eq.actor,actor_key.eq.${actorKey})` : '',
          endpointKey ? `and(rule_scope.eq.endpoint,endpoint_key.eq.${endpointKey})` : '',
        ]
          .filter(Boolean)
          .join(','),
      )
      .order('priority', { ascending: true })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0] as ExternalCostRuleRow;
  }

  async resolveOptionMultipliers(
    provider: string,
    taskType: ExternalProviderTaskType,
    optionsJson?: Record<string, unknown>,
  ): Promise<ExternalOptionCostMultiplierRow[]> {
    if (!optionsJson || Object.keys(optionsJson).length === 0) return [];

    const { data, error } = await this.supabase
      .from('external_option_cost_multipliers')
      .select('*')
      .eq('provider', provider)
      .eq('is_active', true);

    if (error || !data) return [];

    const rows = data as ExternalOptionCostMultiplierRow[];
    return rows.filter((row) => {
      // Must apply to this task type (or applies_to_task_types is empty = applies everywhere)
      const taskTypes = row.applies_to_task_types ?? [];
      if (taskTypes.length > 0 && !taskTypes.includes(taskType)) return false;

      // The option must be present and match the expected value
      const rawValue = optionsJson[row.option_key];
      if (rawValue === undefined || rawValue === null || rawValue === false || rawValue === '') return false;

      if (row.option_value === null) {
        // Any truthy value for this key triggers the multiplier
        return Boolean(rawValue);
      }

      return String(rawValue) === row.option_value;
    });
  }

  // ── Pre-call estimate (DB rule path) ─────────────────────────────────────

  async calculatePreCallEstimate(params: PreCallParams): Promise<ExternalUsageMetrics> {
    const {
      provider,
      taskType,
      endpointKey,
      datasetKey,
      actorKey,
      planProfileId,
      accountId,
      expectedRequests = 1,
      expectedRecords = 0,
      expectedSuccessfulRecords = 0,
      expectedPages = 0,
      expectedResults = 0,
      expectedBrowserMinutes = 0,
      expectedMb = 0,
      optionsJson,
      overageUnitPrice = 0,
      remainingFreeUnits = 0,
    } = params;

    const [costRule, optionMultipliers] = await Promise.all([
      this.resolveActiveCostRule(provider, taskType, endpointKey, datasetKey, actorKey, planProfileId, accountId),
      this.resolveOptionMultipliers(provider, taskType, optionsJson),
    ]);

    if (costRule) {
      return this.computeFromDbRule({
        costRule,
        optionMultipliers,
        requestCount: expectedRequests,
        recordCount: expectedRecords,
        successfulRecordCount: expectedSuccessfulRecords,
        pageCount: expectedPages,
        resultCount: expectedResults,
        browserMinutes: expectedBrowserMinutes,
        dataMb: expectedMb,
        overageUnitPrice,
        remainingFreeUnits,
        costSource: 'estimated',
        providerResponse: null,
        endpointKey: endpointKey ?? null,
        datasetKey: datasetKey ?? null,
        actorKey: actorKey ?? null,
      });
    }

    // Fallback: zero metrics with estimated source
    return {
      unitType: null,
      requestCount: expectedRequests,
      recordCount: expectedRecords,
      pageCount: expectedPages,
      searchCount: 0,
      creditCost: 0,
      usdCreditCost: 0,
      usedUnits: 0,
      estimatedCostUsd: 0,
      freeUnitsApplied: 0,
      paidUnitsApplied: 0,
      paidCostUsd: 0,
      ...EMPTY_EXTENDED,
      costSource: 'estimated',
      costBreakdownJson: {
        provider, taskType, costRule: null, noRuleFound: true,
      },
    };
  }

  // ── Post-call settlement (DB rule path) ──────────────────────────────────

  async calculatePostCallSettlement(params: PostCallParams): Promise<ExternalUsageMetrics> {
    const {
      provider,
      taskType,
      endpointKey,
      datasetKey,
      actorKey,
      providerResponse,
      costRule,
      optionMultipliers,
      planProfile,
      remainingFreeUnits = 0,
    } = params;

    const responseRecord = asRecord(providerResponse);
    const overageUnitPrice = asFiniteNumber(planProfile?.overage_unit_price) ?? 0;

    if (costRule) {
      const formulaJson = asRecord(costRule.formula_json) ?? {};
      const preferProviderCost = formulaJson['prefer_provider_reported_cost'] === true;
      const preferProviderUnits = formulaJson['prefer_provider_reported_units'] === true;
      const providerCostField = typeof formulaJson['provider_cost_field'] === 'string'
        ? formulaJson['provider_cost_field']
        : 'usageUsd';

      const providerReportedCostUsd = preferProviderCost
        ? (asFiniteNumber(getByPath(responseRecord, providerCostField)) ?? null)
        : null;

      const providerReportedUnits = preferProviderUnits
        ? (inferCount(getByPath(responseRecord, 'units')) ?? inferCount(getByPath(responseRecord, 'credits')) ?? null)
        : null;

      // Count actuals from the response
      const recordCount = inferCount(responseRecord?.records) ?? inferCount(responseRecord?.results) ?? 0;
      const successfulRecordCount =
        inferCount(responseRecord?.successfulRecords) ??
        inferCount(responseRecord?.successful_records) ??
        recordCount;
      const failedRecordCount =
        inferCount(responseRecord?.failedRecords) ??
        inferCount(responseRecord?.failed_records) ??
        0;
      const pageCount = inferCount(responseRecord?.pages) ?? inferCount(responseRecord?.pageCount) ?? 0;
      const resultCount = inferCount(responseRecord?.resultCount) ?? inferCount(responseRecord?.results) ?? 0;
      const browserMinutes = asFiniteNumber(responseRecord?.browserMinutes) ?? 0;
      const dataMb = asFiniteNumber(responseRecord?.dataMb) ?? asFiniteNumber(responseRecord?.data_transfer_mb) ?? 0;
      const requestCount = asFiniteNumber(responseRecord?.requestCount) ?? 1;

      return this.computeFromDbRule({
        costRule,
        optionMultipliers,
        requestCount,
        recordCount,
        successfulRecordCount,
        pageCount,
        resultCount,
        browserMinutes,
        dataMb,
        overageUnitPrice,
        remainingFreeUnits,
        costSource: providerReportedCostUsd != null ? 'provider_reported' : 'calculated',
        providerResponse: responseRecord,
        providerReportedUnits,
        providerReportedCostUsd,
        endpointKey: endpointKey ?? null,
        datasetKey: datasetKey ?? null,
        actorKey: actorKey ?? null,
      });
    }

    // Fallback to legacy plan-profile cost rule path
    return this.buildUsageMetrics(taskType, providerResponse, planProfile, 'actual');
  }

  // ── Internal: compute from a DB cost rule row ────────────────────────────

  private computeFromDbRule(input: {
    costRule: ExternalCostRuleRow;
    optionMultipliers: ExternalOptionCostMultiplierRow[];
    requestCount: number;
    recordCount: number;
    successfulRecordCount: number;
    pageCount: number;
    resultCount: number;
    browserMinutes: number;
    dataMb: number;
    overageUnitPrice: number;
    remainingFreeUnits: number;
    costSource: 'estimated' | 'calculated' | 'provider_reported';
    providerResponse: JsonRecord | null;
    providerReportedUnits?: number | null;
    providerReportedCostUsd?: number | null;
    endpointKey: string | null;
    datasetKey: string | null;
    actorKey: string | null;
  }): ExternalUsageMetrics {
    const {
      costRule, optionMultipliers, requestCount, recordCount, successfulRecordCount,
      pageCount, resultCount, browserMinutes, dataMb, overageUnitPrice, remainingFreeUnits,
      costSource, providerReportedUnits, providerReportedCostUsd,
    } = input;

    const unitType = costRule.unit_type;
    const r = costRule;

    // Compute base units from the most specific dimension
    let baseUnits = Number(r.base_units ?? 0);
    const billingEvent = r.billing_event;

    if (billingEvent === 'after_provider_report' && providerReportedUnits != null) {
      baseUnits = providerReportedUnits;
    } else if (Number(r.units_per_successful_record) > 0) {
      baseUnits += successfulRecordCount * Number(r.units_per_successful_record);
    } else if (Number(r.units_per_record) > 0) {
      baseUnits += recordCount * Number(r.units_per_record);
    } else if (Number(r.units_per_page) > 0) {
      baseUnits += pageCount * Number(r.units_per_page);
    } else if (Number(r.units_per_search) > 0) {
      baseUnits += (input.providerResponse ? recordCount : requestCount) * Number(r.units_per_search);
    } else if (Number(r.units_per_result) > 0) {
      baseUnits += resultCount * Number(r.units_per_result);
    } else if (Number(r.units_per_browser_minute) > 0) {
      baseUnits += browserMinutes * Number(r.units_per_browser_minute);
    } else if (Number(r.units_per_mb) > 0) {
      baseUnits += dataMb * Number(r.units_per_mb);
    } else if (Number(r.units_per_request) > 0) {
      baseUnits += requestCount * Number(r.units_per_request);
    }

    // Apply option multipliers
    const appliedMultipliers: Array<{ key: string; value: string | null; multiplier: number }> = [];
    let multiplierTotal = 1;
    for (const om of optionMultipliers) {
      const m = Number(om.multiplier ?? 1);
      multiplierTotal *= m;
      appliedMultipliers.push({ key: om.option_key, value: om.option_value, multiplier: m });
    }

    const finalUnits = roundUnits(baseUnits * multiplierTotal);

    // Apply minimum / maximum
    const minUnits = Number(r.minimum_units ?? 0);
    const maxUnits = r.maximum_units != null ? Number(r.maximum_units) : null;
    const clampedUnits = Math.max(finalUnits, minUnits);
    const cappedUnits = maxUnits != null ? Math.min(clampedUnits, maxUnits) : clampedUnits;

    // Free tier
    const freeUnitsApplied = Math.min(Math.max(remainingFreeUnits, 0), cappedUnits);
    const billableUnits = roundUnits(Math.max(cappedUnits - freeUnitsApplied, 0));
    const paidUnitsApplied = billableUnits;

    const unitPriceUsd = Number(r.unit_price_usd ?? overageUnitPrice ?? 0);
    const calculatedCostUsd = providerReportedCostUsd != null
      ? providerReportedCostUsd
      : roundUsd(billableUnits * unitPriceUsd);
    const paidCostUsd = calculatedCostUsd;

    const breakdown: ExternalCostBreakdown = {
      provider: costRule.provider,
      taskType: costRule.task_type ?? '',
      endpointKey: input.endpointKey,
      datasetKey: input.datasetKey,
      actorKey: input.actorKey,
      costRule: costRule.rule_name,
      costRuleId: costRule.id,
      unitType,
      baseUnits: roundUnits(baseUnits),
      requestCount,
      recordCount,
      successfulRecordCount,
      failedRecordCount: input.costRule ? 0 : 0,
      pageCount,
      resultCount,
      browserMinutes,
      dataMb,
      optionMultipliers: appliedMultipliers,
      multiplierTotal,
      finalUnits: roundUnits(finalUnits),
      freeUnitsBefore: remainingFreeUnits,
      freeUnitsRemainingBefore: remainingFreeUnits,
      freeUnitsApplied: roundUnits(freeUnitsApplied),
      paidUnitsApplied: roundUnits(paidUnitsApplied),
      unitPriceUsd,
      calculatedCostUsd,
      providerReportedUnits: providerReportedUnits ?? null,
      providerReportedCostUsd: providerReportedCostUsd ?? null,
      costSource,
    };

    // Legacy compat fields
    const isCreditType = unitType === 'credit' || unitType === 'api_credit';
    const creditCost = isCreditType ? cappedUnits : 0;
    const usdCreditCost = unitType === 'usd_credit' ? (providerReportedCostUsd ?? calculatedCostUsd) : 0;

    return {
      unitType,
      requestCount,
      recordCount,
      pageCount,
      searchCount: 0,
      creditCost: roundUnits(creditCost),
      usdCreditCost: roundUsd(usdCreditCost),
      usedUnits: roundUnits(cappedUnits),
      estimatedCostUsd: roundUsd(calculatedCostUsd),
      freeUnitsApplied: roundUnits(freeUnitsApplied),
      paidUnitsApplied: roundUnits(paidUnitsApplied),
      paidCostUsd: roundUsd(paidCostUsd),
      // Extended
      successfulRecordCount,
      failedRecordCount: 0,
      resultCount,
      browserMinutes,
      dataMb,
      baseUnits: roundUnits(baseUnits),
      multiplierTotal,
      finalUnits: roundUnits(finalUnits),
      billableUnits: roundUnits(billableUnits),
      unitPriceUsd,
      calculatedCostUsd: roundUsd(calculatedCostUsd),
      providerReportedUnits: providerReportedUnits ?? null,
      providerReportedCostUsd: providerReportedCostUsd ?? null,
      costSource,
      costRuleId: costRule.id,
      costBreakdownJson: breakdown as unknown as Record<string, unknown>,
    };
  }

  // ── Build cost breakdown object ───────────────────────────────────────────

  buildCostBreakdown(
    rule: ExternalCostRuleRow | null,
    optionMultipliers: ExternalOptionCostMultiplierRow[],
    counts: {
      requestCount: number;
      recordCount: number;
      successfulRecordCount: number;
      failedRecordCount: number;
      pageCount: number;
      resultCount: number;
      browserMinutes: number;
      dataMb: number;
      finalUnits: number;
      freeUnitsApplied: number;
      paidUnitsApplied: number;
    },
    freeUnitsBefore: number,
    unitPriceUsd: number,
    costSource: 'estimated' | 'calculated' | 'provider_reported' | 'manual_adjusted' | 'reconciled',
    providerReportedUnits?: number | null,
    providerReportedCostUsd?: number | null,
  ): ExternalCostBreakdown {
    const appliedMultipliers = optionMultipliers.map((om) => ({
      key: om.option_key,
      value: om.option_value,
      multiplier: Number(om.multiplier ?? 1),
    }));
    const multiplierTotal = appliedMultipliers.reduce((acc, m) => acc * m.multiplier, 1);
    const calculatedCostUsd = providerReportedCostUsd != null
      ? providerReportedCostUsd
      : roundUsd(counts.paidUnitsApplied * unitPriceUsd);

    return {
      provider: rule?.provider ?? '',
      taskType: rule?.task_type ?? '',
      endpointKey: rule?.endpoint_key ?? null,
      datasetKey: rule?.dataset_key ?? null,
      actorKey: rule?.actor_key ?? null,
      costRule: rule?.rule_name ?? null,
      costRuleId: rule?.id ?? null,
      unitType: rule?.unit_type ?? null,
      baseUnits: 0,
      requestCount: counts.requestCount,
      recordCount: counts.recordCount,
      successfulRecordCount: counts.successfulRecordCount,
      failedRecordCount: counts.failedRecordCount,
      pageCount: counts.pageCount,
      resultCount: counts.resultCount,
      browserMinutes: counts.browserMinutes,
      dataMb: counts.dataMb,
      optionMultipliers: appliedMultipliers,
      multiplierTotal,
      finalUnits: counts.finalUnits,
      freeUnitsBefore,
      freeUnitsRemainingBefore: freeUnitsBefore,
      freeUnitsApplied: counts.freeUnitsApplied,
      paidUnitsApplied: counts.paidUnitsApplied,
      unitPriceUsd,
      calculatedCostUsd,
      providerReportedUnits: providerReportedUnits ?? null,
      providerReportedCostUsd: providerReportedCostUsd ?? null,
      costSource,
    };
  }

  // ── Legacy plan-profile-based calculation (kept for backward compat) ──────

  calculateEstimatedUsage(
    _provider: string,
    taskType: ExternalProviderTaskType,
    input: unknown,
    planProfile: ExternalProviderPlanProfileRow | null,
  ): ExternalUsageMetrics {
    return this.buildUsageMetrics(taskType, input, planProfile, 'estimate');
  }

  calculateActualUsage(
    _provider: string,
    taskType: ExternalProviderTaskType,
    providerResponse: unknown,
    planProfile: ExternalProviderPlanProfileRow | null,
  ): ExternalUsageMetrics {
    return this.buildUsageMetrics(taskType, providerResponse, planProfile, 'actual');
  }

  applyFreeTier(
    usage: ExternalUsageMetrics,
    remainingFreeUnits: number,
    overageUnitPrice: number,
  ): FreeTierApplication {
    const freeUnitsApplied = Math.min(Math.max(remainingFreeUnits, 0), usage.usedUnits);
    const paidUnitsApplied = Math.max(usage.usedUnits - freeUnitsApplied, 0);
    return {
      freeUnitsApplied: roundUnits(freeUnitsApplied),
      paidUnitsApplied: roundUnits(paidUnitsApplied),
      paidCostUsd: roundUsd(paidUnitsApplied * Math.max(overageUnitPrice, 0)),
    };
  }

  calculatePaidOverage(
    usage: ExternalUsageMetrics,
    remainingFreeUnits: number,
    overageUnitPrice: number,
  ): number {
    return this.applyFreeTier(usage, remainingFreeUnits, overageUnitPrice).paidCostUsd;
  }

  calculateUsagePercent(usedUnits: number, entitlementUnits: number): number {
    if (entitlementUnits <= 0) return usedUnits > 0 ? 100 : 0;
    return Math.min(100, roundUnits((usedUnits / entitlementUnits) * 100));
  }

  calculateProjectedExhaustion(
    usageHistory: UsageHistoryPoint[],
    remainingUnits: number,
  ): string | null {
    if (remainingUnits <= 0 || usageHistory.length < 2) return null;

    const sorted = [...usageHistory].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const first = sorted.at(0);
    const last = sorted.at(-1);
    if (!first || !last) return null;
    const elapsedHours = Math.max((Date.parse(last.timestamp) - Date.parse(first.timestamp)) / 3_600_000, 0);
    if (elapsedHours <= 0) return null;

    const consumed = Math.max(last.usedUnits - first.usedUnits, 0);
    const unitsPerHour = consumed / elapsedHours;
    if (unitsPerHour <= 0) return null;

    return new Date(Date.parse(last.timestamp) + (remainingUnits / unitsPerHour) * 3_600_000).toISOString();
  }

  calculateProjectedPeriodCost(
    usageVelocityPerDay: number,
    periodEnd: string,
    overageUnitPrice: number,
    remainingFreeUnits = 0,
  ): number {
    const now = Date.now();
    const end = Date.parse(periodEnd);
    if (!Number.isFinite(end) || end <= now || usageVelocityPerDay <= 0) return 0;

    const daysRemaining = (end - now) / 86_400_000;
    const projectedUnits = usageVelocityPerDay * daysRemaining;
    const billableUnits = Math.max(projectedUnits - Math.max(remainingFreeUnits, 0), 0);
    return roundUsd(billableUnits * Math.max(overageUnitPrice, 0));
  }

  resolvePeriodWindow(
    planProfile: ExternalProviderPlanProfileRow | null,
    referenceAt = new Date().toISOString(),
  ): ProviderPeriodWindow {
    const tz = planProfile?.renewal_timezone?.trim() || 'UTC';
    const now = dayjs(referenceAt).tz(tz);
    const interval = planProfile?.renewal_interval ?? 'monthly';

    if (interval === 'daily') {
      return {
        periodType: 'daily',
        start: now.startOf('day').toISOString(),
        end: now.endOf('day').toISOString(),
        nextResetAt: now.endOf('day').add(1, 'millisecond').toISOString(),
      };
    }

    if (interval === 'weekly') {
      const anchor = this.anchorDay(planProfile?.renewal_anchor_day);
      const currentDay = now.day();
      const diff = (currentDay - anchor + 7) % 7;
      const start = now.subtract(diff, 'day').startOf('day');
      return {
        periodType: 'weekly',
        start: start.toISOString(),
        end: start.add(7, 'day').subtract(1, 'millisecond').toISOString(),
        nextResetAt: start.add(7, 'day').toISOString(),
      };
    }

    if (interval === 'trial') {
      const start = planProfile?.trial_starts_at
        ? dayjs(planProfile.trial_starts_at).tz(tz)
        : now.startOf('day');
      const end = planProfile?.trial_ends_at
        ? dayjs(planProfile.trial_ends_at).tz(tz)
        : start.add(30, 'day').endOf('day');
      return {
        periodType: 'trial',
        start: start.toISOString(),
        end: end.toISOString(),
        nextResetAt: end.add(1, 'millisecond').toISOString(),
      };
    }

    if (interval === 'custom' || interval === 'manual') {
      const start = now.startOf('month');
      return {
        periodType: 'custom',
        start: start.toISOString(),
        end: start.add(30, 'day').subtract(1, 'millisecond').toISOString(),
        nextResetAt: null,
      };
    }

    if (interval === 'yearly') {
      return {
        periodType: 'custom',
        start: now.startOf('year').toISOString(),
        end: now.endOf('year').toISOString(),
        nextResetAt: now.startOf('year').add(1, 'year').toISOString(),
      };
    }

    return {
      periodType: 'monthly',
      start: now.startOf('month').toISOString(),
      end: now.endOf('month').toISOString(),
      nextResetAt: now.startOf('month').add(1, 'month').toISOString(),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildUsageMetrics(
    taskType: ExternalProviderTaskType,
    input: unknown,
    planProfile: ExternalProviderPlanProfileRow | null,
    mode: 'estimate' | 'actual',
  ): ExternalUsageMetrics {
    const record = asRecord(input);
    const rule = this.resolveLegacyCostRule(taskType, planProfile);
    const unitType = normalizeRuleUnitType(rule.unit_type, planProfile?.unit_type ?? 'credit');

    const requestCount = Math.max(1, inferCount(getByPath(record, 'requestCount')) ?? inferCount(record?.requestCount) ?? 1);
    const recordCount =
      inferCount(getByPath(record, 'recordCount')) ??
      inferCount(record?.recordCount) ??
      inferCount(record?.records) ??
      inferCount(record?.results) ??
      0;
    const pageCount =
      inferCount(getByPath(record, 'pageCount')) ??
      inferCount(record?.pageCount) ??
      inferCount(record?.pages) ??
      0;
    const searchCount =
      inferCount(getByPath(record, 'searchCount')) ??
      inferCount(record?.searchCount) ??
      (unitType === 'search' || taskType === 'public_search' ? requestCount : 0);

    const usedUnits = this.resolveLegacyUsedUnits({
      rule,
      requestCount,
      recordCount,
      pageCount,
      searchCount,
      mode,
      record,
    });

    const creditCost =
      unitType === 'credit' || unitType === 'api_credit' ? usedUnits : 0;
    const usdCreditCost =
      unitType === 'usd_credit'
        ? asFiniteNumber(getByPath(record, rule.provider_cost_field)) ??
          rule.fallback_estimated_cost_usd ??
          usedUnits
        : 0;
    const estimatedCostUsd =
      unitType === 'usd_credit'
        ? usdCreditCost
        : usedUnits * (planProfile?.overage_unit_price ?? 0);

    return {
      unitType,
      requestCount,
      recordCount,
      pageCount,
      searchCount,
      creditCost: roundUnits(creditCost),
      usdCreditCost: roundUsd(usdCreditCost),
      usedUnits: roundUnits(usedUnits),
      estimatedCostUsd: roundUsd(estimatedCostUsd),
      freeUnitsApplied: 0,
      paidUnitsApplied: 0,
      paidCostUsd: 0,
      ...EMPTY_EXTENDED,
      costSource: mode === 'estimate' ? 'estimated' : 'calculated',
    };
  }

  private resolveLegacyCostRule(
    taskType: ExternalProviderTaskType,
    planProfile: ExternalProviderPlanProfileRow | null,
  ): LegacyCostRule {
    const rules = asRecord(planProfile?.cost_rules);
    const taskRules = asRecord(rules?.task_rules);
    const taskRule = asRecord(taskRules?.[taskType]);
    const defaultRule = asRecord(rules?.default);
    return {
      ...(defaultRule ?? {}),
      ...(taskRule ?? {}),
    };
  }

  private resolveLegacyUsedUnits(input: {
    rule: LegacyCostRule;
    requestCount: number;
    recordCount: number;
    pageCount: number;
    searchCount: number;
    mode: 'estimate' | 'actual';
    record: JsonRecord | null;
  }): number {
    const multiplier = this.legacyOptionMultiplier(input.rule, input.record);

    if (input.rule.bill_on === 'provider_reported') {
      const providerReported =
        asFiniteNumber(getByPath(input.record, input.rule.provider_cost_field)) ??
        input.rule.fallback_estimated_cost_usd ??
        input.rule.estimated_units ??
        0;
      return roundUnits(providerReported * multiplier);
    }

    if (input.rule.units_per_record != null) {
      return roundUnits(input.recordCount * input.rule.units_per_record * multiplier);
    }

    if (input.rule.units_per_page != null) {
      return roundUnits(input.pageCount * input.rule.units_per_page * multiplier);
    }

    if (input.rule.units_per_search != null) {
      return roundUnits(input.searchCount * input.rule.units_per_search * multiplier);
    }

    if (input.rule.units_per_request != null) {
      return roundUnits(input.requestCount * input.rule.units_per_request * multiplier);
    }

    if (input.rule.units_per_success != null) {
      const count = input.mode === 'estimate'
        ? Math.max(input.recordCount, input.pageCount, input.searchCount, input.requestCount)
        : Math.max(input.recordCount, input.pageCount, input.searchCount, 1);
      return roundUnits(count * input.rule.units_per_success * multiplier);
    }

    if (input.rule.estimated_units != null) {
      return roundUnits(input.rule.estimated_units * multiplier);
    }

    return roundUnits(input.requestCount * multiplier);
  }

  private legacyOptionMultiplier(rule: LegacyCostRule, record: JsonRecord | null): number {
    const multipliers = rule.option_multipliers ?? {};
    return Object.entries(multipliers).reduce((factor, [key, value]) => {
      if (!record) return factor;
      const raw = getByPath(record, key);
      if (raw === true) return factor * value;
      const numeric = asFiniteNumber(raw);
      if (numeric != null && numeric > 0) return factor * value;
      return factor;
    }, 1);
  }

  private anchorDay(value: string | null | undefined): number {
    switch ((value ?? '').trim().toLowerCase()) {
      case 'sunday':
        return 0;
      case 'monday':
      case 'account_configured':
      case '':
        return 1;
      case 'tuesday':
        return 2;
      case 'wednesday':
        return 3;
      case 'thursday':
        return 4;
      case 'friday':
        return 5;
      case 'saturday':
        return 6;
      default:
        return 1;
    }
  }
}
