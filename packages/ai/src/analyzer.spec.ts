import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyzeOpportunity,
  type AnalyzerAiOutput,
  buildAnalyzerPrompt,
  evaluateBadLeadRules,
  parseAnalyzerOutput,
  type AnalyzerCompanyProfile,
  type AnalyzerDiscovery,
} from './analyzer';
import { buildHeuristicScoringStrategy } from './scoring';
import { AIService } from './service';
import { FakeProvider } from './providers/fake';
import type { AiCallContext, TaskRoute } from './types';

interface AnalyzerGoldenFixture {
  discovery: AnalyzerDiscovery;
  profile: AnalyzerCompanyProfile;
  response: AnalyzerAiOutput;
  expected: {
    score: number;
    countryMatch: boolean;
    budgetFit: 'above_min' | 'below_min' | 'unknown';
    scoreReason: string;
  };
}

function readJsonFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8')) as T;
}

function readTextFixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf8').trimEnd();
}

const ctx: AiCallContext = { taskType: 'opportunity_analyzer', organizationId: 'org-1', userId: 'user-1' };
const route: TaskRoute = {
  taskType: 'opportunity_analyzer',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};
const golden = readJsonFixture<AnalyzerGoldenFixture>('analyzer.golden.json');
const goldenPrompt = readTextFixture('analyzer.prompt.txt');

function emptyProfile(overrides: Partial<AnalyzerCompanyProfile> = {}): AnalyzerCompanyProfile {
  return {
    services: [],
    priorityServices: [],
    targetIndustries: [],
    targetCountries: [],
    minBudget: null,
    badLeadRules: { logic: 'any', rules: [] },
    ...overrides,
  };
}

const goodOutput = JSON.stringify({
  intent: 'high',
  urgency: 'soon',
  budgetFit: 'above_min',
  budgetEstimate: 9000,
  serviceMatches: [{ service: 'web', confidence: 0.9, isPriority: true }],
  confidence: 0.8,
  recommendedAction: 'Reach out today',
  reason: 'Strong fit on services and budget',
});

function analyzerService(responder: () => string): AIService {
  return new AIService({
    providers: [new FakeProvider({ responder })],
    routes: { opportunity_analyzer: route },
  });
}

describe('evaluateBadLeadRules', () => {
  const discovery: AnalyzerDiscovery = {
    title: 'Need a cheap WordPress site',
    country: 'IN',
    companyName: 'Acme',
    budgetHint: 200,
    website: 'https://acme.test',
  };

  it('returns no match when there are no rules', () => {
    expect(evaluateBadLeadRules(discovery, { logic: 'any', rules: [] })).toEqual({ matched: false });
  });

  it('matches a country equals rule (case-insensitive)', () => {
    const result = evaluateBadLeadRules(discovery, {
      logic: 'any',
      rules: [{ field: 'country', operator: 'equals', value: 'in' }],
    });
    expect(result.matched).toBe(true);
    expect(result.reason).toContain('country');
  });

  it('matches a budget lt rule and a keyword contains rule', () => {
    expect(
      evaluateBadLeadRules(discovery, { logic: 'any', rules: [{ field: 'budget', operator: 'lt', value: 500 }] }).matched,
    ).toBe(true);
    expect(
      evaluateBadLeadRules(discovery, {
        logic: 'any',
        rules: [{ field: 'keyword', operator: 'contains', value: 'wordpress' }],
      }).matched,
    ).toBe(true);
  });

  it('requires every rule to hit under all logic', () => {
    const rules = {
      logic: 'all' as const,
      rules: [
        { field: 'budget' as const, operator: 'lt' as const, value: 500 },
        { field: 'country' as const, operator: 'equals' as const, value: 'us' },
      ],
    };
    expect(evaluateBadLeadRules(discovery, rules).matched).toBe(false);
  });

  it('supports in and exists operators', () => {
    expect(
      evaluateBadLeadRules(discovery, {
        logic: 'any',
        rules: [{ field: 'country', operator: 'in', value: ['us', 'in', 'uk'] }],
      }).matched,
    ).toBe(true);
    expect(
      evaluateBadLeadRules({ website: null }, { logic: 'any', rules: [{ field: 'website', operator: 'not_exists' }] })
        .matched,
    ).toBe(true);
  });
});

describe('parseAnalyzerOutput', () => {
  it('parses and clamps a valid object', () => {
    const out = parseAnalyzerOutput({
      intent: 'high',
      urgency: 'urgent',
      budgetFit: 'above_min',
      budgetEstimate: 5000,
      serviceMatches: [{ service: 'seo', confidence: 5, isPriority: true }],
      confidence: 2,
      recommendedAction: 'Call now',
      reason: 'Great fit',
    });
    expect(out.confidence).toBe(1);
    expect(out.serviceMatches[0]).toEqual({ service: 'seo', confidence: 1, isPriority: true });
  });

  it('coerces unknown enum values to safe defaults', () => {
    const out = parseAnalyzerOutput({
      intent: 'nope',
      urgency: 'whenever',
      budgetFit: 'maybe',
      recommendedAction: 'x',
      reason: 'y',
    });
    expect(out).toMatchObject({ intent: 'unclear', urgency: 'none', budgetFit: 'unknown', serviceMatches: [] });
  });

  it('throws when recommendedAction or reason is missing', () => {
    expect(() => parseAnalyzerOutput({ intent: 'high', reason: 'y' })).toThrow(/recommendedAction/);
    expect(() => parseAnalyzerOutput('not json')).toThrow(/JSON object/);
  });
});

describe('buildAnalyzerPrompt', () => {
  it('includes profile + discovery context and the JSON schema', () => {
    const prompt = buildAnalyzerPrompt(
      { title: 'New site', country: 'US' },
      emptyProfile({ services: ['web'], targetCountries: ['US'] }),
    );
    expect(prompt).toContain('Our services: web');
    expect(prompt).toContain('Title: New site');
    expect(prompt).toContain('"recommendedAction": string');
  });

  it('matches the golden analyzer fixture prompt', () => {
    expect(buildAnalyzerPrompt(golden.discovery, golden.profile)).toBe(goldenPrompt);
  });
});

describe('analyzeOpportunity', () => {
  const strategy = buildHeuristicScoringStrategy();

  it('short-circuits bad leads without calling the model', async () => {
    let called = 0;
    const ai = analyzerService(() => {
      called += 1;
      return goodOutput;
    });
    const result = await analyzeOpportunity(ai, ctx, {
      discovery: { title: 'tiny job', budgetHint: 50 },
      profile: emptyProfile({ minBudget: 1000, badLeadRules: { logic: 'any', rules: [{ field: 'budget', operator: 'lt', value: 500 }] } }),
      strategy,
    });
    expect(called).toBe(0);
    expect(result.isBadLead).toBe(true);
    expect(result.score).toBe(0);
    expect(result.recommendedAction).toMatch(/Reject/);
  });

  it('extracts AI signals and applies the deterministic score', async () => {
    const ai = analyzerService(() => goodOutput);
    const result = await analyzeOpportunity(ai, ctx, {
      discovery: { title: 'Marketing site rebuild', country: 'US', budgetHint: 12000 },
      profile: emptyProfile({ services: ['web'], targetCountries: ['US'], minBudget: 5000 }),
      strategy,
    });

    expect(result.isBadLead).toBe(false);
    expect(result.intent).toBe('high');
    expect(result.countryMatch).toBe(true);
    expect(result.budgetFit).toBe('above_min');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.scoreResult.factors.length).toBeGreaterThan(0);
  });

  it('incorporates similarityToWon into the final score', async () => {
    const ai = analyzerService(() => goodOutput);
    const result = await analyzeOpportunity(ai, ctx, {
      discovery: { title: 'Marketing site rebuild' },
      profile: emptyProfile({ services: ['web'] }),
      strategy,
      similarityToWon: 0.9,
    });

    expect(result.isBadLead).toBe(false);
    expect(result.scoreResult.factors.some((f) => f.key === 'similarity_to_won')).toBe(true);
    const similarityFactor = result.scoreResult.factors.find((f) => f.key === 'similarity_to_won');
    expect(similarityFactor?.contribution).toBeGreaterThan(0);
  });

  it('overrides AI budget fit deterministically when min budget and a figure are known', async () => {
    const ai = analyzerService(() =>
      JSON.stringify({ ...JSON.parse(goodOutput), budgetFit: 'above_min', budgetEstimate: null }),
    );
    const result = await analyzeOpportunity(ai, ctx, {
      discovery: { title: 'Low budget gig', budgetHint: 100 },
      profile: emptyProfile({ minBudget: 5000 }),
      strategy,
    });
    expect(result.budgetFit).toBe('below_min');
  });

  it('produces the golden analyzer result from the recorded fixture response', async () => {
    const ai = analyzerService(() => JSON.stringify(golden.response));
    const result = await analyzeOpportunity(ai, ctx, {
      discovery: golden.discovery,
      profile: golden.profile,
      strategy,
    });

    expect(result).toMatchObject({
      score: 80, // expectedScore
      intent: golden.response.intent,
      urgency: golden.response.urgency,
      budgetFit: golden.expected.budgetFit,
      budgetEstimate: golden.response.budgetEstimate,
      serviceMatches: golden.response.serviceMatches,
      countryMatch: golden.expected.countryMatch,
      confidence: golden.response.confidence,
      recommendedAction: golden.response.recommendedAction,
      reason: golden.response.reason,
      isBadLead: false,
    });
    expect(result.scoreResult.reason).toBe(golden.expected.scoreReason);
  });
});
