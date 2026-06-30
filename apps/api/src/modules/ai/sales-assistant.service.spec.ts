import { AIService, FakeProvider, type PromptResolver, type TaskRoute } from '@radar/ai';
import type { Database, ServiceClient } from '@radar/supabase';
import { SalesAssistantService } from './sales-assistant.service';
import type { AiProviderPoolService } from './ai-provider-pool.service';

type OutreachMessageRow = Database['public']['Tables']['outreach_messages']['Row'];
type ConversationRow = Database['public']['Tables']['conversations']['Row'];
type LeadRow = Database['public']['Tables']['leads']['Row'];
type CompanyProfileRow = Database['public']['Tables']['company_profiles']['Row'];

const route: TaskRoute = {
  taskType: 'sales_message',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

const routeFollowUp: TaskRoute = {
  taskType: 'follow_up_message',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

const routeSummary: TaskRoute = {
  taskType: 'conversation_summary',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

const routeNextAction: TaskRoute = {
  taskType: 'next_action',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

const routeMeeting: TaskRoute = {
  taskType: 'meeting_prep',
  attempts: [{ provider: 'fake', model: 'fake-1' }],
  requiresJson: true,
};

const goodMessage = JSON.stringify({
  subject: 'Hello from Acme',
  body: 'Hi, we build sites.',
});

const goodSummary = JSON.stringify({
  summary: 'Discussed building a site.',
});

const goodMeeting = JSON.stringify({
  objective: 'Discuss specs',
  agenda: ['Intro', 'Specs'],
  questions: ['Timeline?'],
});

const goodNextAction = JSON.stringify({
  recommendedAction: 'Send proposal',
  reasoning: 'They asked for it',
  priority: 'high',
});

function leadRow(): LeadRow {
  return {
    id: 'lead-1',
    organization_id: 'org-1',
    opportunity_id: null,
    company_id: null,
    primary_contact_id: null,
    source: 'inbound',
    title: 'Lead 1',
    description: null,
    stage: 'new',
    score: 0,
    priority: 'medium',
    priority_weight: 50,
    value: 10000,
    currency: null,
    owner_id: null,
    close_reason: null,
    closed_at: null,
    created_by: null,
    created_at: '2026-06-23T00:00:00.000Z',
    updated_at: '2026-06-23T00:00:00.000Z',
    deleted_at: null,
  };
}

function conversationRow(): ConversationRow {
  return {
    id: 'conv-1',
    organization_id: 'org-1',
    channel: 'email',
    lead_id: 'lead-1',
    opportunity_id: null,
    company_id: null,
    contact_id: null,
    summary: null,
    last_message_at: null,
    created_at: '2026-06-23T00:00:00.000Z',
    updated_at: '2026-06-23T00:00:00.000Z',
    deleted_at: null,
  };
}

function makeSupabase(opts: {
  onInsertMessage?: (payload: any) => void;
  onUpdateConversation?: (id: string, payload: any) => void;
}) {
  const from = jest.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      insert: (payload: any) => {
        if (table === 'outreach_messages' && opts.onInsertMessage) opts.onInsertMessage(payload);
        return chain;
      },
      update: (payload: any) => {
        if (table === 'conversations' && opts.onUpdateConversation) opts.onUpdateConversation('conv-1', payload);
        return chain;
      },
      eq: () => chain,
      is: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => {
        if (table === 'outreach_messages') return Promise.resolve({ data: { id: 'msg-1' }, error: null });
        if (table === 'conversations') return Promise.resolve({ data: conversationRow(), error: null });
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => {
        if (table === 'leads') return Promise.resolve({ data: leadRow(), error: null });
        if (table === 'conversations') return Promise.resolve({ data: conversationRow(), error: null });
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: any) => {
        if (table === 'outreach_messages') return resolve({ data: [], error: null });
        return resolve({ data: null, error: null });
      },
    });
    return chain;
  });

  return { from } as unknown as ServiceClient;
}

function makePool(ai: AIService) {
  return {
    buildService: jest.fn().mockResolvedValue(ai),
  } as unknown as AiProviderPoolService;
}

describe('SalesAssistantService', () => {
  let fakeProvider: FakeProvider;
  let aiService: AIService;
  const resolver: PromptResolver = jest.fn().mockResolvedValue({
    id: 'version-1',
    template: 'test prompt',
    model_config: {},
  });

  beforeEach(() => {
    fakeProvider = new FakeProvider();
    aiService = new AIService({
      providers: [fakeProvider],
      routes: {
        sales_message: route,
        follow_up_message: routeFollowUp,
        conversation_summary: routeSummary,
        next_action: routeNextAction,
        meeting_prep: routeMeeting,
      },
      resolvePrompt: resolver,
    });
  });

  it('drafts a sales message and records it', async () => {
    fakeProvider = new FakeProvider({ responder: () => goodMessage });
    aiService = new AIService({
      providers: [fakeProvider],
      routes: { sales_message: route },
      resolvePrompt: resolver,
    });

    const inserted: any[] = [];
    const updatedConv: any[] = [];
    const supabase = makeSupabase({
      onInsertMessage: (p) => inserted.push(p),
      onUpdateConversation: (id, p) => updatedConv.push({ id, ...p }),
    });
    const pool = makePool(aiService);
    const service = new SalesAssistantService(supabase, pool);

    await service.draftMessage('org-1', 'user-1', {
      entityType: 'lead',
      entityId: 'lead-1',
      kind: 'sales_message',
      channel: 'email',
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0].subject).toBe('Hello from Acme');
    expect(inserted[0].body).toBe('Hi, we build sites.');
    expect(inserted[0].status).toBe('draft');
    expect(inserted[0].is_ai_generated).toBe(true);

    expect(updatedConv).toHaveLength(1);
    expect(updatedConv[0].last_message_at).toBeDefined();
  });

  it('summarizes a conversation', async () => {
    fakeProvider = new FakeProvider({ responder: () => goodSummary });
    aiService = new AIService({
      providers: [fakeProvider],
      routes: { conversation_summary: routeSummary },
      resolvePrompt: resolver,
    });

    const updatedConv: any[] = [];
    const supabase = makeSupabase({
      onUpdateConversation: (id, p) => updatedConv.push({ id, ...p }),
    });
    const pool = makePool(aiService);
    const service = new SalesAssistantService(supabase, pool);

    const summary = await service.summarizeConversation('org-1', 'user-1', 'conv-1');

    expect(summary).toBe('Discussed building a site.');
    expect(updatedConv).toHaveLength(1);
    expect(updatedConv[0].summary).toBe('Discussed building a site.');
  });
});
