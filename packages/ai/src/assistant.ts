/**
 * AI Sales Assistant agent (P6-02). Given an entity (lead/opportunity) plus its recent outreach and
 * the workspace outreach tone, the model drafts a message, drafts a follow-up, summarizes a
 * conversation, prepares for a meeting, or suggests the next action. Pure: no DB and no deterministic
 * post-processing beyond cleaning/clamping the structured output, so the API writer
 * (`outreach_messages` / `conversations.summary`) and tests can drive it offline. Mirrors the
 * analyzer/researcher pure-agent pattern.
 */

import type { AIService } from './service';
import type { AiCallContext } from './types';

export interface AssistantEntityContext {
  kind: 'lead' | 'opportunity';
  title: string;
  companyName?: string | null;
  contactName?: string | null;
  /** Lead stage or opportunity status. */
  stage?: string | null;
  value?: number | null;
  recommendedAction?: string | null;
  /** Free-text detail — the AI explanation / description. */
  notes?: string | null;
}

export interface AssistantMessageContext {
  direction: 'outbound' | 'inbound' | 'internal_note';
  body: string;
}

export interface SalesAssistantContext {
  entity: AssistantEntityContext;
  /** Outreach channel the draft is for (email/linkedin/…). */
  channel: string;
  /** Workspace outreach tone from the Company Brain, if set. */
  tone?: string | null;
  /** Most recent messages on the thread, oldest first. */
  recentMessages?: AssistantMessageContext[];
  /** Optional operator instruction ("offer a 20% discount", "keep it to 3 sentences"). */
  instruction?: string | null;
}

export interface DraftedMessage {
  subject: string | null;
  body: string;
}

export interface ConversationSummaryResult {
  summary: string;
}

export interface MeetingPrep {
  talkingPoints: string[];
  questions: string[];
  risks: string[];
}

export interface NextActionSuggestion {
  action: string;
  reasoning: string | null;
}

const MAX_LIST = 8;
const MAX_RECENT_MESSAGES = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

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

// ── Shared context rendering ────────────────────────────────────────────────────────────────────

function renderEntity(entity: AssistantEntityContext): string[] {
  return [
    `Type: ${entity.kind}`,
    `Title: ${entity.title}`,
    entity.companyName ? `Company: ${entity.companyName}` : null,
    entity.contactName ? `Contact: ${entity.contactName}` : null,
    entity.stage ? `Stage: ${entity.stage}` : null,
    entity.value != null ? `Potential value: ${entity.value}` : null,
    entity.recommendedAction ? `Recommended action: ${entity.recommendedAction}` : null,
    entity.notes ? `Notes: ${entity.notes}` : null,
  ].filter((line): line is string => line !== null);
}

function renderThread(messages: AssistantMessageContext[] | undefined): string[] {
  if (!messages || messages.length === 0) return ['(no prior messages)'];
  return messages.slice(-MAX_RECENT_MESSAGES).map((m) => {
    const who = m.direction === 'outbound' ? 'Us' : m.direction === 'inbound' ? 'Them' : 'Note';
    return `${who}: ${m.body.trim()}`;
  });
}

function renderContext(sac: SalesAssistantContext): string[] {
  return [
    'ENTITY',
    ...renderEntity(sac.entity),
    '',
    `CHANNEL: ${sac.channel}`,
    sac.tone ? `TONE: ${sac.tone}` : 'TONE: professional, concise, friendly',
    '',
    'CONVERSATION (oldest first)',
    ...renderThread(sac.recentMessages),
    ...(sac.instruction ? ['', `INSTRUCTION: ${sac.instruction}`] : []),
  ];
}

// ── Drafted messages (sales_message / follow_up_message) ──────────────────────────────────────────

export function parseDraftedMessage(raw: unknown): DraftedMessage {
  if (!isRecord(raw)) throw new Error('drafted message output must be a JSON object');
  const body = nonEmptyString(raw.body);
  if (!body) throw new Error('drafted message output requires a non-empty body');
  return { subject: nonEmptyString(raw.subject), body };
}

function buildMessagePrompt(sac: SalesAssistantContext, followUp: boolean): string {
  const intent = followUp
    ? 'Draft a brief, non-pushy FOLLOW-UP message that moves the conversation forward, referencing the prior thread.'
    : 'Draft a first outreach message that opens a relevant, specific conversation.';
  return [
    'You are a sales assistant drafting outreach on behalf of an agency/freelancer.',
    intent,
    'Use only the facts provided; do not invent specifics (names, numbers, dates) you were not given.',
    'Match the requested tone and channel. For non-email channels, "subject" must be null.',
    '',
    ...renderContext(sac),
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{ "subject": string | null, "body": string }',
    'Keep the body tight (a few short paragraphs at most) and end with a clear, low-friction ask.',
  ].join('\n');
}

export function buildSalesMessagePrompt(sac: SalesAssistantContext): string {
  return buildMessagePrompt(sac, false);
}

export function buildFollowUpMessagePrompt(sac: SalesAssistantContext): string {
  return buildMessagePrompt(sac, true);
}

export async function draftSalesMessage(
  ai: AIService,
  ctx: AiCallContext,
  sac: SalesAssistantContext,
): Promise<DraftedMessage> {
  return ai.generateStructured(ctx, {
    prompt: buildSalesMessagePrompt(sac),
    parse: parseDraftedMessage,
    schemaName: 'sales_message',
  });
}

export async function draftFollowUpMessage(
  ai: AIService,
  ctx: AiCallContext,
  sac: SalesAssistantContext,
): Promise<DraftedMessage> {
  return ai.generateStructured(ctx, {
    prompt: buildFollowUpMessagePrompt(sac),
    parse: parseDraftedMessage,
    schemaName: 'follow_up_message',
  });
}

// ── Conversation summary (conversation_summary) ───────────────────────────────────────────────────

export function parseConversationSummary(raw: unknown): ConversationSummaryResult {
  if (!isRecord(raw)) throw new Error('conversation summary output must be a JSON object');
  const summary = nonEmptyString(raw.summary);
  if (!summary) throw new Error('conversation summary output requires a non-empty summary');
  return { summary };
}

export function buildConversationSummaryPrompt(sac: SalesAssistantContext): string {
  return [
    'Summarize the outreach conversation below for a sales rep who needs to catch up fast.',
    'Capture where things stand, what the other side wants, and any open commitments — no fluff.',
    '',
    ...renderContext(sac),
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{ "summary": string }',
    'Keep the summary to 2-4 sentences.',
  ].join('\n');
}

export async function summarizeConversation(
  ai: AIService,
  ctx: AiCallContext,
  sac: SalesAssistantContext,
): Promise<ConversationSummaryResult> {
  return ai.generateStructured(ctx, {
    prompt: buildConversationSummaryPrompt(sac),
    parse: parseConversationSummary,
    schemaName: 'conversation_summary',
  });
}

// ── Meeting prep (meeting_prep) ───────────────────────────────────────────────────────────────────

export function parseMeetingPrep(raw: unknown): MeetingPrep {
  if (!isRecord(raw)) throw new Error('meeting prep output must be a JSON object');
  return {
    talkingPoints: stringList(raw.talkingPoints, MAX_LIST),
    questions: stringList(raw.questions, MAX_LIST),
    risks: stringList(raw.risks, MAX_LIST),
  };
}

export function buildMeetingPrepPrompt(sac: SalesAssistantContext): string {
  return [
    'Prepare a sales rep for a meeting about the entity below.',
    'Use only the facts provided plus widely known, stable knowledge.',
    '',
    ...renderContext(sac),
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{ "talkingPoints": string[], "questions": string[], "risks": string[] }',
    'Keep each list focused (<= 6): talking points to raise, questions to ask, and risks to watch.',
  ].join('\n');
}

export async function prepareMeeting(
  ai: AIService,
  ctx: AiCallContext,
  sac: SalesAssistantContext,
): Promise<MeetingPrep> {
  return ai.generateStructured(ctx, {
    prompt: buildMeetingPrepPrompt(sac),
    parse: parseMeetingPrep,
    schemaName: 'meeting_prep',
  });
}

// ── Next action (next_action) ─────────────────────────────────────────────────────────────────────

export function parseNextAction(raw: unknown): NextActionSuggestion {
  if (!isRecord(raw)) throw new Error('next action output must be a JSON object');
  const action = nonEmptyString(raw.action);
  if (!action) throw new Error('next action output requires a non-empty action');
  return { action, reasoning: nonEmptyString(raw.reasoning) };
}

export function buildNextActionPrompt(sac: SalesAssistantContext): string {
  return [
    'Recommend the single best next action to move this opportunity toward revenue.',
    'Be concrete and immediately doable. Use only the facts provided.',
    '',
    ...renderContext(sac),
    '',
    'Return ONLY a JSON object with this exact shape:',
    '{ "action": string, "reasoning": string | null }',
    'The action is one clear next step; reasoning is a short why (one sentence) or null.',
  ].join('\n');
}

export async function suggestNextAction(
  ai: AIService,
  ctx: AiCallContext,
  sac: SalesAssistantContext,
): Promise<NextActionSuggestion> {
  return ai.generateStructured(ctx, {
    prompt: buildNextActionPrompt(sac),
    parse: parseNextAction,
    schemaName: 'next_action',
  });
}
