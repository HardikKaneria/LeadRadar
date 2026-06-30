/**
 * Company Research agent (P4-04). The model enriches a company from its known facts — a short
 * summary, the likely industry, observed tech stack, plausible problems, and services we could
 * pitch. Pure: no DB and no deterministic post-processing beyond cleaning/clamping the structured
 * output, so the API writer (`companies.enrichment`) and tests can drive it offline.
 */

import type { AIService } from './service';
import type { AiCallContext } from './types';

export interface ResearchCompanyInput {
  name: string;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  country?: string | null;
  knownTechStack?: string[];
  /** Optional free-text context (e.g. titles/descriptions of the company's linked opportunities). */
  context?: string | null;
}

export interface CompanyResearch {
  summary: string;
  industry: string | null;
  techStack: string[];
  problems: string[];
  suggestedServices: string[];
}

const MAX_LIST = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Trimmed, de-duplicated, non-empty strings, capped to `max` entries. */
function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const text = nonEmptyString(entry);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

export function parseCompanyResearchOutput(raw: unknown): CompanyResearch {
  if (!isRecord(raw)) {
    throw new Error('company research output must be a JSON object');
  }

  const summary = nonEmptyString(raw.summary);
  if (!summary) {
    throw new Error('company research output requires a non-empty summary');
  }

  return {
    summary,
    industry: nonEmptyString(raw.industry),
    techStack: stringList(raw.techStack, MAX_LIST),
    problems: stringList(raw.problems, MAX_LIST),
    suggestedServices: stringList(raw.suggestedServices, MAX_LIST),
  };
}

export function buildCompanyResearchPrompt(input: ResearchCompanyInput): string {
  const companyLines = [
    `Name: ${input.name}`,
    input.domain ? `Domain: ${input.domain}` : null,
    input.website ? `Website: ${input.website}` : null,
    input.industry ? `Known industry: ${input.industry}` : null,
    input.country ? `Country: ${input.country}` : null,
    input.knownTechStack && input.knownTechStack.length
      ? `Known tech stack: ${input.knownTechStack.join(', ')}`
      : null,
    input.context ? `Context: ${input.context}` : null,
  ].filter((line): line is string => line !== null);

  return [
    'You are researching a company so a sales team can decide how to approach it.',
    'Use only the facts provided plus widely known, stable knowledge. Do not invent specifics',
    '(funding numbers, headcount, named people) you cannot infer — leave fields general instead.',
    '',
    'COMPANY',
    ...companyLines,
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{',
    '  "summary": string,',
    '  "industry": string | null,',
    '  "techStack": string[],',
    '  "problems": string[],',
    '  "suggestedServices": string[]',
    '}',
    'Keep the summary to 2-3 sentences. "problems" are likely pain points this company has;',
    '"suggestedServices" are services we could pitch to solve them. Keep each list focused (<= 6).',
  ].join('\n');
}

export async function researchCompany(
  ai: AIService,
  ctx: AiCallContext,
  input: ResearchCompanyInput,
): Promise<CompanyResearch> {
  return ai.generateStructured(ctx, {
    prompt: buildCompanyResearchPrompt(input),
    parse: parseCompanyResearchOutput,
    schemaName: 'company_research',
  });
}
