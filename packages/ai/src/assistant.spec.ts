import {
  buildFollowUpMessagePrompt,
  buildMeetingPrepPrompt,
  buildSalesMessagePrompt,
  draftFollowUpMessage,
  draftSalesMessage,
  parseConversationSummary,
  parseDraftedMessage,
  parseMeetingPrep,
  parseNextAction,
  prepareMeeting,
  suggestNextAction,
  summarizeConversation,
  type SalesAssistantContext,
} from './assistant';
import { AIService } from './service';
import { FakeProvider } from './providers/fake';
import type { AiCallContext, AiTaskType, TaskRoute } from './types';

const sac: SalesAssistantContext = {
  entity: {
    kind: 'lead',
    title: 'Website rebuild for Acme',
    companyName: 'Acme',
    contactName: 'Ada',
    stage: 'contacted',
    value: 12000,
    recommendedAction: 'Send a tailored proposal',
    notes: 'Wants a faster, modern marketing site.',
  },
  channel: 'email',
  tone: 'warm and direct',
  recentMessages: [
    { direction: 'outbound', body: 'Hi Ada, sharing a quick idea for the rebuild.' },
    { direction: 'inbound', body: 'Thanks — can you send pricing?' },
  ],
  instruction: 'Keep it under 4 sentences.',
};

function serviceFor(taskType: AiTaskType, responder: () => string): AIService {
  const route: TaskRoute = { taskType, attempts: [{ provider: 'fake', model: 'fake-1' }], requiresJson: true };
  return new AIService({ providers: [new FakeProvider({ responder })], routes: { [taskType]: route } });
}

function ctxFor(taskType: AiTaskType): AiCallContext {
  return { taskType, organizationId: 'org-1', userId: 'user-1' };
}

describe('parsers', () => {
  it('parseDraftedMessage requires a body and defaults subject to null', () => {
    expect(parseDraftedMessage({ body: '  Hello  ' })).toEqual({ subject: null, body: 'Hello' });
    expect(parseDraftedMessage({ subject: 'Hi', body: 'There' })).toEqual({ subject: 'Hi', body: 'There' });
    expect(() => parseDraftedMessage({ subject: 'Hi' })).toThrow(/body/);
    expect(() => parseDraftedMessage('nope')).toThrow(/JSON object/);
  });

  it('parseConversationSummary requires a non-empty summary', () => {
    expect(parseConversationSummary({ summary: ' caught up ' })).toEqual({ summary: 'caught up' });
    expect(() => parseConversationSummary({})).toThrow(/summary/);
  });

  it('parseMeetingPrep cleans, de-duplicates, and caps the lists', () => {
    const out = parseMeetingPrep({
      talkingPoints: ['Speed', 'speed', '', 'SEO'],
      questions: ['Budget?'],
      risks: ['No decision-maker', 'No decision-maker'],
    });
    expect(out.talkingPoints).toEqual(['Speed', 'SEO']);
    expect(out.questions).toEqual(['Budget?']);
    expect(out.risks).toEqual(['No decision-maker']);
    expect(parseMeetingPrep({})).toEqual({ talkingPoints: [], questions: [], risks: [] });
  });

  it('parseNextAction requires an action and defaults reasoning to null', () => {
    expect(parseNextAction({ action: 'Send pricing' })).toEqual({ action: 'Send pricing', reasoning: null });
    expect(parseNextAction({ action: 'Call', reasoning: 'They asked' })).toEqual({ action: 'Call', reasoning: 'They asked' });
    expect(() => parseNextAction({ reasoning: 'x' })).toThrow(/action/);
  });
});

describe('prompt builders', () => {
  it('render the entity, channel, tone, and JSON schema', () => {
    const prompt = buildSalesMessagePrompt(sac);
    expect(prompt).toContain('Title: Website rebuild for Acme');
    expect(prompt).toContain('CHANNEL: email');
    expect(prompt).toContain('TONE: warm and direct');
    expect(prompt).toContain('INSTRUCTION: Keep it under 4 sentences.');
    expect(prompt).toContain('"subject": string | null, "body": string');
  });

  it('renders the thread with Us/Them labels and a follow-up framing', () => {
    const prompt = buildFollowUpMessagePrompt(sac);
    expect(prompt).toContain('Us: Hi Ada, sharing a quick idea for the rebuild.');
    expect(prompt).toContain('Them: Thanks — can you send pricing?');
    expect(prompt).toContain('FOLLOW-UP');
  });

  it('defaults the tone and shows an empty-thread placeholder', () => {
    const bare = buildMeetingPrepPrompt({ entity: { kind: 'opportunity', title: 'X' }, channel: 'meeting' });
    expect(bare).toContain('TONE: professional, concise, friendly');
    expect(bare).toContain('(no prior messages)');
  });
});

describe('generation (FakeProvider)', () => {
  it('drafts a sales message and a follow-up from the recorded response', async () => {
    const draft = { subject: 'Quick idea', body: 'Here is a tailored plan.' };
    const sales = await draftSalesMessage(serviceFor('sales_message', () => JSON.stringify(draft)), ctxFor('sales_message'), sac);
    expect(sales).toEqual(draft);

    const follow = await draftFollowUpMessage(
      serviceFor('follow_up_message', () => JSON.stringify({ subject: null, body: 'Just circling back.' })),
      ctxFor('follow_up_message'),
      sac,
    );
    expect(follow).toEqual({ subject: null, body: 'Just circling back.' });
  });

  it('summarizes, preps a meeting, and suggests a next action', async () => {
    const summary = await summarizeConversation(
      serviceFor('conversation_summary', () => JSON.stringify({ summary: 'Ada asked for pricing.' })),
      ctxFor('conversation_summary'),
      sac,
    );
    expect(summary).toEqual({ summary: 'Ada asked for pricing.' });

    const prep = await prepareMeeting(
      serviceFor('meeting_prep', () => JSON.stringify({ talkingPoints: ['Speed'], questions: ['Budget?'], risks: [] })),
      ctxFor('meeting_prep'),
      sac,
    );
    expect(prep.talkingPoints).toEqual(['Speed']);

    const next = await suggestNextAction(
      serviceFor('next_action', () => JSON.stringify({ action: 'Send pricing', reasoning: 'They asked' })),
      ctxFor('next_action'),
      sac,
    );
    expect(next).toEqual({ action: 'Send pricing', reasoning: 'They asked' });
  });

  it('repairs a non-JSON first response then parses the retry', async () => {
    let calls = 0;
    const ai = serviceFor('sales_message', () => {
      calls += 1;
      return calls === 1 ? 'Sure! Here you go: ...' : JSON.stringify({ subject: null, body: 'Clean draft.' });
    });
    const result = await draftSalesMessage(ai, ctxFor('sales_message'), sac);
    expect(result).toEqual({ subject: null, body: 'Clean draft.' });
    expect(calls).toBe(2);
  });
});
