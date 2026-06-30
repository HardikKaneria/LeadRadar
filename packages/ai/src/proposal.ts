/**
 * Proposal Generator agent (P6-03). The model drafts a client proposal for a lead/opportunity from
 * its known facts plus the services the workspace offers — a title, a short summary, structured
 * sections (problem / approach / scope / timeline / pricing), and a pricing note. Pure: no DB and no
 * deterministic post-processing beyond cleaning/clamping the structured output, so the API writer
 * (`proposals.content`) and tests can drive it offline. Mirrors the analyzer/researcher pattern.
 */

import type { AIService } from './service';
import type { AiCallContext } from './types';

export interface ProposalInput {
  entityTitle: string;
  entityKind: 'lead' | 'opportunity';
  companyName?: string | null;
  contactName?: string | null;
  /** Services the workspace offers (Company Brain) — what we can credibly propose. */
  services?: string[];
  tone?: string | null;
  value?: number | null;
  currency?: string | null;
  /** Free-text context — recommended action / AI explanation / notes. */
  context?: string | null;
}

export interface ProposalSection {
  heading: string;
  body: string;
}

export interface ProposalDraft {
  title: string;
  summary: string;
  sections: ProposalSection[];
  pricingNote: string | null;
}

const MAX_SECTIONS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function parseSections(value: unknown): ProposalSection[] {
  if (!Array.isArray(value)) return [];
  const out: ProposalSection[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const heading = nonEmptyString(entry.heading);
    const body = nonEmptyString(entry.body);
    if (!heading || !body) continue;
    out.push({ heading, body });
    if (out.length >= MAX_SECTIONS) break;
  }
  return out;
}

export function parseProposalOutput(raw: unknown): ProposalDraft {
  if (!isRecord(raw)) throw new Error('proposal output must be a JSON object');
  const title = nonEmptyString(raw.title);
  if (!title) throw new Error('proposal output requires a non-empty title');
  const summary = nonEmptyString(raw.summary);
  if (!summary) throw new Error('proposal output requires a non-empty summary');
  const sections = parseSections(raw.sections);
  if (sections.length === 0) throw new Error('proposal output requires at least one section');
  return { title, summary, sections, pricingNote: nonEmptyString(raw.pricingNote) };
}

export function buildProposalPrompt(input: ProposalInput): string {
  const facts = [
    `For: ${input.entityKind} "${input.entityTitle}"`,
    input.companyName ? `Company: ${input.companyName}` : null,
    input.contactName ? `Contact: ${input.contactName}` : null,
    input.services && input.services.length ? `Services we offer: ${input.services.join(', ')}` : null,
    input.value != null ? `Target value: ${input.currency ? `${input.currency} ` : ''}${input.value}` : null,
    input.context ? `Context: ${input.context}` : null,
  ].filter((line): line is string => line !== null);

  return [
    'You are drafting a concise, persuasive client proposal on behalf of an agency/freelancer.',
    'Use only the facts provided plus widely known, stable knowledge — do not invent specifics',
    '(named people, exact figures, dates) you were not given. Propose only services we offer.',
    `Tone: ${input.tone ?? 'professional, confident, concise'}.`,
    '',
    'INPUT',
    ...facts,
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{',
    '  "title": string,',
    '  "summary": string,',
    '  "sections": [{ "heading": string, "body": string }],',
    '  "pricingNote": string | null',
    '}',
    'Cover problem understanding, proposed approach, scope/deliverables, timeline, and pricing across',
    'the sections (<= 6). Keep the summary to 2-3 sentences; pricingNote is a short pricing framing or null.',
  ].join('\n');
}

export async function generateProposal(
  ai: AIService,
  ctx: AiCallContext,
  input: ProposalInput,
): Promise<ProposalDraft> {
  return ai.generateStructured(ctx, {
    prompt: buildProposalPrompt(input),
    parse: parseProposalOutput,
    schemaName: 'proposal_generator',
  });
}

/** Render a drafted proposal to Markdown — the human-readable artifact persisted alongside the JSON. */
export function renderProposalMarkdown(draft: ProposalDraft): string {
  const parts = [`# ${draft.title}`, '', draft.summary, ''];
  for (const section of draft.sections) {
    parts.push(`## ${section.heading}`, '', section.body, '');
  }
  if (draft.pricingNote) {
    parts.push('## Pricing', '', draft.pricingNote, '');
  }
  return parts.join('\n').trimEnd() + '\n';
}
