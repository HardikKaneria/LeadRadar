import type { AiCallContext } from '@radar/ai';
import type { Database, ServiceClient } from '@radar/supabase';
import { AiPromptService, mapPromptVersionRow } from './ai-prompt.service';

type AiPromptVersionRow = Database['public']['Tables']['ai_prompt_versions']['Row'];

const ctx: AiCallContext = { taskType: 'opportunity_analyzer', organizationId: 'org-1', userId: 'user-1' };

function makeRow(overrides: Partial<AiPromptVersionRow> = {}): AiPromptVersionRow {
  return {
    id: 'prompt-1',
    organization_id: null,
    agent: 'opportunity_analyzer',
    version: 1,
    name: 'System default',
    description: null,
    system_prompt: 'system default prompt',
    user_prompt_template: null,
    output_schema: {},
    model_preferences: {},
    is_active: true,
    created_by: null,
    created_at: '2026-06-23T00:00:00.000Z',
    updated_at: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}

function makeSupabase(rows: AiPromptVersionRow[], error: { message: string } | null = null) {
  const or = jest.fn().mockResolvedValue({ data: rows, error });
  const eqActive = jest.fn(() => ({ or }));
  const eqAgent = jest.fn(() => ({ eq: eqActive }));
  const select = jest.fn(() => ({ eq: eqAgent }));
  const from = jest.fn(() => ({ select }));
  const supabase = { from } as unknown as ServiceClient;
  return { supabase, from, select, eqAgent, eqActive, or };
}

describe('mapPromptVersionRow', () => {
  it('maps a row to the gateway ResolvedPrompt shape', () => {
    expect(
      mapPromptVersionRow(
        makeRow({
          id: 'p9',
          system_prompt: 'do the thing',
          user_prompt_template: 'context: {x}',
          model_preferences: { provider: 'gemini' },
        }),
      ),
    ).toEqual({
      promptVersionId: 'p9',
      system: 'do the thing',
      userPromptTemplate: 'context: {x}',
      modelPreferences: { provider: 'gemini' },
    });
  });

  it('drops an empty system prompt and array-shaped preferences', () => {
    const resolved = mapPromptVersionRow(
      makeRow({ system_prompt: '', model_preferences: [] as never }),
    );
    expect(resolved.system).toBeUndefined();
    expect(resolved.modelPreferences).toBeUndefined();
  });
});

describe('AiPromptService.resolveActivePrompt', () => {
  it('queries the active version for the org plus the system default', async () => {
    const { supabase, from, eqAgent, eqActive, or } = makeSupabase([makeRow()]);
    const service = new AiPromptService(supabase);

    await service.resolveActivePrompt(ctx);

    expect(from).toHaveBeenCalledWith('ai_prompt_versions');
    expect(eqAgent).toHaveBeenCalledWith('agent', 'opportunity_analyzer');
    expect(eqActive).toHaveBeenCalledWith('is_active', true);
    expect(or).toHaveBeenCalledWith('organization_id.eq.org-1,organization_id.is.null');
  });

  it('prefers the org-custom version over the system default', async () => {
    const { supabase } = makeSupabase([
      makeRow({ id: 'system', organization_id: null }),
      makeRow({ id: 'custom', organization_id: 'org-1', system_prompt: 'org override' }),
    ]);
    const service = new AiPromptService(supabase);

    const resolved = await service.resolveActivePrompt(ctx);
    expect(resolved).toMatchObject({ promptVersionId: 'custom', system: 'org override' });
  });

  it('falls back to the system default when the org has no custom version', async () => {
    const { supabase } = makeSupabase([makeRow({ id: 'system', organization_id: null })]);
    const service = new AiPromptService(supabase);

    const resolved = await service.resolveActivePrompt(ctx);
    expect(resolved?.promptVersionId).toBe('system');
  });

  it('returns null when no active version exists', async () => {
    const { supabase } = makeSupabase([]);
    const service = new AiPromptService(supabase);
    expect(await service.resolveActivePrompt(ctx)).toBeNull();
  });

  it('throws when the query errors', async () => {
    const { supabase } = makeSupabase([], { message: 'boom' });
    const service = new AiPromptService(supabase);
    await expect(service.resolveActivePrompt(ctx)).rejects.toThrow('boom');
  });
});
