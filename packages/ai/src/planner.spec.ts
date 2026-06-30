import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildActionPlannerPrompt,
  parseActionPlannerOutput,
  planNextAction,
  type PlannerAiOutput,
  type PlannerAnalysis,
  type PlannerPipelineState,
} from './planner';
import type { AnalyzerDiscovery } from './analyzer';
import { AIService } from './service';
import { FakeProvider } from './providers/fake';
import type { AiCallContext, TaskRoute } from './types';

interface PlannerGoldenFixture {
  discovery: AnalyzerDiscovery;
  analysis: PlannerAnalysis;
  pipeline: PlannerPipelineState;
  response: PlannerAiOutput;
  expected: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    priorityWeight: number;
    dueAt: string;
  };
}

function readJsonFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8')) as T;
}

function readTextFixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf8').trimEnd();
}

const ctx: AiCallContext = { taskType: 'action_planner', organizationId: 'org-1', userId: 'user-1' };
const route: TaskRoute = {
  taskType: 'action_planner',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};
const golden = readJsonFixture<PlannerGoldenFixture>('planner.golden.json');
const goldenPrompt = readTextFixture('planner.prompt.txt');

const discovery: AnalyzerDiscovery = {
  title: 'WooCommerce rebuild',
  description: 'Need a faster storefront and ongoing CRO help',
  companyName: 'Acme',
  country: 'US',
  source: 'upwork',
  budgetHint: 15000,
};

function analysis(overrides: Partial<PlannerAnalysis> = {}): PlannerAnalysis {
  return {
    score: 82,
    intent: 'high',
    urgency: 'soon',
    serviceMatches: [{ service: 'web', confidence: 0.9, isPriority: true }],
    budgetEstimate: 15000,
    confidence: 0.84,
    recommendedAction: 'Reach out within 24 hours',
    reason: 'Strong service fit with a healthy budget',
    isBadLead: false,
    ...overrides,
  };
}

function plannerService(responder: () => string): AIService {
  return new AIService({
    providers: [new FakeProvider({ responder })],
    routes: { action_planner: route },
  });
}

describe('parseActionPlannerOutput', () => {
  it('parses a valid object and defaults missing task details safely', () => {
    const out = parseActionPlannerOutput({
      recommendedAction: 'Send a short intro email',
      reason: 'Email is the least-friction first touch here',
      plannedTask: { type: 'email' },
    });

    expect(out).toEqual({
      recommendedAction: 'Send a short intro email',
      reason: 'Email is the least-friction first touch here',
      plannedTask: {
        title: 'Send a short intro email',
        type: 'email',
        notes: 'Send a short intro email',
      },
    });
  });

  it('throws when recommendedAction or reason is missing', () => {
    expect(() => parseActionPlannerOutput({ reason: 'x' })).toThrow(/recommendedAction/);
    expect(() => parseActionPlannerOutput('not json')).toThrow(/JSON object/);
  });
});

describe('buildActionPlannerPrompt', () => {
  it('includes the analysis, pipeline context, and JSON task shape', () => {
    const prompt = buildActionPlannerPrompt(discovery, analysis(), { discoveryStatus: 'reviewed' });
    expect(prompt).toContain('LATEST ANALYSIS');
    expect(prompt).toContain('Score: 82');
    expect(prompt).toContain('Discovery status: reviewed');
    expect(prompt).toContain('"type": "call|email|message|meeting|proposal|custom"');
  });

  it('matches the golden planner fixture prompt', () => {
    expect(buildActionPlannerPrompt(golden.discovery, golden.analysis, golden.pipeline)).toBe(goldenPrompt);
  });
});

describe('planNextAction', () => {
  it('short-circuits bad leads without calling the model', async () => {
    let called = 0;
    const ai = plannerService(() => {
      called += 1;
      return '{}';
    });

    const result = await planNextAction(
      ai,
      ctx,
      { discovery, analysis: analysis({ isBadLead: true, reason: 'Below budget and outside ICP' }) },
      { now: new Date('2026-06-24T00:00:00.000Z') },
    );

    expect(called).toBe(0);
    expect(result.isBadLead).toBe(true);
    expect(result.priority).toBe('low');
    expect(result.plannedTask.type).toBe('custom');
  });

  it('uses AI wording but keeps priority and due date deterministic', async () => {
    const ai = plannerService(() =>
      JSON.stringify({
        recommendedAction: 'Send a tailored intro email with two relevant case studies',
        reason: 'A thoughtful first-touch email fits the context best',
        plannedTask: {
          title: 'Draft and send intro email',
          type: 'email',
          notes: 'Reference the WooCommerce rebuild and CRO support need.',
        },
      }),
    );

    const result = await planNextAction(
      ai,
      ctx,
      { discovery, analysis: analysis({ score: 90, urgency: 'urgent' }) },
      { now: new Date('2026-06-24T00:00:00.000Z') },
    );

    expect(result.recommendedAction).toMatch(/tailored intro email/i);
    expect(result.priority).toBe('critical');
    expect(result.priorityWeight).toBe(100);
    expect(result.dueAt.toISOString()).toBe('2026-06-24T04:00:00.000Z');
    expect(result.plannedTask.type).toBe('email');
  });

  it('produces the golden planner result from the recorded fixture response', async () => {
    const ai = plannerService(() => JSON.stringify(golden.response));

    const result = await planNextAction(
      ai,
      ctx,
      { discovery: golden.discovery, analysis: golden.analysis, pipeline: golden.pipeline },
      { now: new Date('2026-06-24T00:00:00.000Z') },
    );

    expect(result).toMatchObject({
      recommendedAction: golden.response.recommendedAction,
      reason: golden.response.reason,
      priority: golden.expected.priority,
      priorityWeight: golden.expected.priorityWeight,
      plannedTask: golden.response.plannedTask,
      isBadLead: false,
    });
    expect(result.dueAt.toISOString()).toBe(golden.expected.dueAt);
  });
});
