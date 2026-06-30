import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCompanyResearchPrompt,
  type CompanyResearch,
  parseCompanyResearchOutput,
  researchCompany,
  type ResearchCompanyInput,
} from './researcher';
import { AIService } from './service';
import { FakeProvider } from './providers/fake';
import type { AiCallContext, TaskRoute } from './types';

interface ResearchGoldenFixture {
  input: ResearchCompanyInput;
  response: CompanyResearch;
}

function readJsonFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8')) as T;
}

function readTextFixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf8').trimEnd();
}

const ctx: AiCallContext = { taskType: 'company_research', organizationId: 'org-1', userId: 'user-1' };
const route: TaskRoute = {
  taskType: 'company_research',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};
const golden = readJsonFixture<ResearchGoldenFixture>('researcher.golden.json');
const goldenPrompt = readTextFixture('researcher.prompt.txt');

function researchService(responder: () => string): AIService {
  return new AIService({
    providers: [new FakeProvider({ responder })],
    routes: { company_research: route },
  });
}

describe('parseCompanyResearchOutput', () => {
  it('cleans and de-duplicates the list fields', () => {
    const out = parseCompanyResearchOutput({
      summary: '  A mid-market retailer.  ',
      industry: '  Retail ',
      techStack: ['React', 'react', '', 'Node'],
      problems: ['Slow checkout', 'Slow checkout'],
      suggestedServices: ['Performance audit'],
    });
    expect(out.summary).toBe('A mid-market retailer.');
    expect(out.industry).toBe('Retail');
    expect(out.techStack).toEqual(['React', 'Node']);
    expect(out.problems).toEqual(['Slow checkout']);
  });

  it('defaults industry to null and lists to empty when absent', () => {
    const out = parseCompanyResearchOutput({ summary: 'Just a summary' });
    expect(out).toEqual({
      summary: 'Just a summary',
      industry: null,
      techStack: [],
      problems: [],
      suggestedServices: [],
    });
  });

  it('throws when the summary is missing or the input is not an object', () => {
    expect(() => parseCompanyResearchOutput({ industry: 'Retail' })).toThrow(/summary/);
    expect(() => parseCompanyResearchOutput('nope')).toThrow(/JSON object/);
  });
});

describe('buildCompanyResearchPrompt', () => {
  it('includes the known company facts and the JSON schema', () => {
    const prompt = buildCompanyResearchPrompt({ name: 'Acme', country: 'US' });
    expect(prompt).toContain('Name: Acme');
    expect(prompt).toContain('Country: US');
    expect(prompt).toContain('"suggestedServices": string[]');
  });

  it('matches the golden research fixture prompt', () => {
    expect(buildCompanyResearchPrompt(golden.input)).toBe(goldenPrompt);
  });
});

describe('researchCompany', () => {
  it('returns the cleaned research from the recorded fixture response', async () => {
    const ai = researchService(() => JSON.stringify(golden.response));
    const result = await researchCompany(ai, ctx, golden.input);
    expect(result).toEqual(golden.response);
  });

  it('repairs a non-JSON first response then parses the second', async () => {
    let calls = 0;
    const ai = researchService(() => {
      calls += 1;
      return calls === 1 ? 'not json' : JSON.stringify(golden.response);
    });
    const result = await researchCompany(ai, ctx, golden.input);
    expect(calls).toBe(2);
    expect(result.summary).toBe(golden.response.summary);
  });
});
