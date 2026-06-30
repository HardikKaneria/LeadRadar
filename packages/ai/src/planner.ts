/**
 * Action Planner (P3-08). The model chooses the *wording* of the next best action and the first
 * task draft; deterministic rules derived from the latest analysis own priority, weight, and the
 * due date so the output stays explainable and cheap to recompute.
 */

import type { AnalyzerDiscovery } from './analyzer';
import type { AIService } from './service';
import type { ScoringIntent, ScoringUrgency, ServiceMatchSignal } from './scoring';
import type { AiCallContext } from './types';

export const PLANNER_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type PlannerPriority = (typeof PLANNER_PRIORITIES)[number];

export const PLANNER_PRIORITY_WEIGHT: Record<PlannerPriority, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

export const PLANNER_TASK_TYPES = ['call', 'email', 'message', 'meeting', 'proposal', 'custom'] as const;
export type PlannerTaskType = (typeof PLANNER_TASK_TYPES)[number];

export interface PlannerTask {
  title: string;
  type: PlannerTaskType;
  notes: string | null;
}

export interface PlannerAnalysis {
  score: number;
  intent: ScoringIntent;
  urgency: ScoringUrgency;
  serviceMatches: ServiceMatchSignal[];
  budgetEstimate: number | null;
  confidence: number;
  recommendedAction?: string | null;
  reason?: string | null;
  isBadLead: boolean;
}

export interface PlannerPipelineState {
  discoveryStatus?: 'new' | 'processing' | 'analyzed' | 'reviewed' | 'approved' | 'ignored' | 'converted' | null;
  hasOpenTask?: boolean;
  stageLabel?: string | null;
}

export interface PlannerAiOutput {
  recommendedAction: string;
  reason: string;
  plannedTask: PlannerTask;
}

export interface PlannerResult {
  recommendedAction: string;
  reason: string;
  priority: PlannerPriority;
  priorityWeight: number;
  dueAt: Date;
  plannedTask: PlannerTask;
  isBadLead: boolean;
}

export interface PlanNextActionInput {
  discovery: AnalyzerDiscovery;
  analysis: PlannerAnalysis;
  pipeline?: PlannerPipelineState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function serviceMatchSummary(matches: ServiceMatchSignal[]): string {
  if (!matches.length) return '(none)';
  return matches
    .map((match) => `${match.service} (${Math.round(match.confidence * 100)}%${match.isPriority ? ', priority' : ''})`)
    .join(', ');
}

function resolvePriority(analysis: PlannerAnalysis): PlannerPriority {
  if (analysis.isBadLead) return 'low';
  if (analysis.score >= 85 || (analysis.urgency === 'urgent' && analysis.score >= 70)) return 'critical';
  if (analysis.score >= 65 || analysis.urgency === 'urgent' || analysis.intent === 'high') return 'high';
  if (analysis.score >= 40 || analysis.urgency === 'soon' || analysis.intent === 'medium') return 'medium';
  return 'low';
}

function resolveDueHours(priority: PlannerPriority, analysis: PlannerAnalysis): number {
  if (analysis.isBadLead) return 72;
  switch (priority) {
    case 'critical':
      return analysis.urgency === 'urgent' ? 4 : 8;
    case 'high':
      return analysis.urgency === 'urgent' ? 12 : 24;
    case 'medium':
      return analysis.urgency === 'soon' ? 48 : 72;
    case 'low':
      return 168;
  }
}

function resolveDueAt(now: Date, priority: PlannerPriority, analysis: PlannerAnalysis): Date {
  return new Date(now.getTime() + resolveDueHours(priority, analysis) * 60 * 60 * 1000);
}

function badLeadPlan(analysis: PlannerAnalysis, now: Date): PlannerResult {
  const priority: PlannerPriority = 'low';
  return {
    recommendedAction: 'Ignore or archive this discovery unless new context changes the fit',
    reason: analysis.reason ?? 'The analyzer marked this discovery as a bad lead',
    priority,
    priorityWeight: PLANNER_PRIORITY_WEIGHT[priority],
    dueAt: resolveDueAt(now, priority, analysis),
    plannedTask: {
      title: 'Review and ignore this discovery',
      type: 'custom',
      notes: analysis.reason ?? 'Confirm the bad-lead decision and archive the discovery if still valid.',
    },
    isBadLead: true,
  };
}

export function parseActionPlannerOutput(raw: unknown): PlannerAiOutput {
  if (!isRecord(raw)) {
    throw new Error('planner output must be a JSON object');
  }

  const recommendedAction = nonEmptyString(raw.recommendedAction);
  const reason = nonEmptyString(raw.reason);
  if (!recommendedAction || !reason) {
    throw new Error('planner output requires non-empty recommendedAction and reason');
  }

  const plannedTaskRecord = isRecord(raw.plannedTask) ? raw.plannedTask : {};
  const title = nonEmptyString(plannedTaskRecord.title) ?? recommendedAction;
  const type = coerceEnum(plannedTaskRecord.type, PLANNER_TASK_TYPES, 'custom');
  const notes = nonEmptyString(plannedTaskRecord.notes) ?? recommendedAction;

  return {
    recommendedAction,
    reason,
    plannedTask: { title, type, notes },
  };
}

export function buildActionPlannerPrompt(
  discovery: AnalyzerDiscovery,
  analysis: PlannerAnalysis,
  pipeline: PlannerPipelineState = {},
): string {
  const discoveryLines = [
    discovery.title ? `Title: ${discovery.title}` : null,
    discovery.companyName ? `Company: ${discovery.companyName}` : null,
    discovery.contactName ? `Contact: ${discovery.contactName}` : null,
    discovery.country ? `Country: ${discovery.country}` : null,
    discovery.source ? `Source: ${discovery.source}` : null,
    discovery.budgetHint != null ? `Budget hint: ${discovery.budgetHint}` : null,
    discovery.description ? `Description: ${discovery.description}` : null,
  ].filter((line): line is string => line !== null);

  return [
    'You are planning the next best sales action for a discovered opportunity.',
    '',
    'DISCOVERY',
    ...(discoveryLines.length ? discoveryLines : ['(no structured discovery fields provided)']),
    '',
    'LATEST ANALYSIS',
    `Score: ${analysis.score}`,
    `Intent: ${analysis.intent}`,
    `Urgency: ${analysis.urgency}`,
    `Confidence: ${analysis.confidence}`,
    `Budget estimate: ${analysis.budgetEstimate == null ? '(unknown)' : analysis.budgetEstimate}`,
    `Service matches: ${serviceMatchSummary(analysis.serviceMatches)}`,
    analysis.recommendedAction ? `Analyzer recommended action: ${analysis.recommendedAction}` : null,
    analysis.reason ? `Analyzer reason: ${analysis.reason}` : null,
    '',
    'PIPELINE',
    `Discovery status: ${pipeline.discoveryStatus ?? 'analyzed'}`,
    `Open task already exists: ${pipeline.hasOpenTask === true ? 'yes' : 'no'}`,
    pipeline.stageLabel ? `Stage label: ${pipeline.stageLabel}` : null,
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{',
    '  "recommendedAction": string,',
    '  "reason": string,',
    '  "plannedTask": {',
    '    "title": string,',
    '    "type": "call|email|message|meeting|proposal|custom",',
    '    "notes": string',
    '  }',
    '}',
    'Make the action concrete, short, and suitable for a human operator to execute next.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

export async function planNextAction(
  ai: AIService,
  ctx: AiCallContext,
  input: PlanNextActionInput,
  options: { now?: Date } = {},
): Promise<PlannerResult> {
  const now = options.now ?? new Date();
  const pipeline = input.pipeline ?? {};

  if (input.analysis.isBadLead) {
    return badLeadPlan(input.analysis, now);
  }

  const aiOutput = await ai.generateStructured(ctx, {
    prompt: buildActionPlannerPrompt(input.discovery, input.analysis, pipeline),
    parse: parseActionPlannerOutput,
    schemaName: 'action_plan',
  });

  const priority = resolvePriority(input.analysis);

  return {
    recommendedAction: aiOutput.recommendedAction,
    reason: aiOutput.reason,
    priority,
    priorityWeight: PLANNER_PRIORITY_WEIGHT[priority],
    dueAt: resolveDueAt(now, priority, input.analysis),
    plannedTask: aiOutput.plannedTask,
    isBadLead: false,
  };
}
