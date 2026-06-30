import type { Database, ServiceClient } from '@radar/supabase';
import { AiRoutingService, buildAiTaskRouteMap, mapAiTaskRouteRow } from './ai-routing.service';

type AiTaskRouteRow = Database['public']['Tables']['ai_task_routes']['Row'];

function makeRouteRow(overrides: Partial<AiTaskRouteRow> = {}): AiTaskRouteRow {
  return {
    id: 'route-1',
    task_type: 'opportunity_analyzer',
    primary_provider: 'gemini',
    primary_model: 'gemini-1.5-flash',
    fallback_provider: 'groq',
    fallback_model: 'llama-3.1-8b-instant',
    fallback_2_provider: null,
    fallback_2_model: null,
    requires_json_schema: true,
    requires_embedding: false,
    max_input_tokens: null,
    max_output_tokens: 1024,
    temperature: 0.2,
    is_active: true,
    created_at: '2026-06-23T00:00:00.000Z',
    updated_at: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('mapAiTaskRouteRow', () => {
  it('maps a DB row to the AIService task-route shape', () => {
    expect(mapAiTaskRouteRow(makeRouteRow())).toEqual({
      taskType: 'opportunity_analyzer',
      attempts: [
        { provider: 'gemini', model: 'gemini-1.5-flash' },
        { provider: 'groq', model: 'llama-3.1-8b-instant' },
      ],
      requiresJson: true,
      requiresEmbedding: undefined,
      maxInputTokens: undefined,
      maxOutputTokens: 1024,
      temperature: 0.2,
    });
  });

  it('includes a third fallback when present', () => {
    const route = mapAiTaskRouteRow(
      makeRouteRow({
        fallback_2_provider: 'openrouter',
        fallback_2_model: 'meta-llama/llama-3.1-8b-instruct:free',
      }),
    );

    expect(route.attempts).toEqual([
      { provider: 'gemini', model: 'gemini-1.5-flash' },
      { provider: 'groq', model: 'llama-3.1-8b-instant' },
      { provider: 'openrouter', model: 'meta-llama/llama-3.1-8b-instruct:free' },
    ]);
  });

  it('throws when the row contains an unknown task type', () => {
    expect(() =>
      mapAiTaskRouteRow(makeRouteRow({ task_type: 'not_real' as never })),
    ).toThrow('Unknown AI task type');
  });
});

describe('buildAiTaskRouteMap', () => {
  it('indexes active rows by task type', () => {
    const routes = buildAiTaskRouteMap([
      makeRouteRow(),
      makeRouteRow({
        id: 'route-2',
        task_type: 'embedding',
        primary_model: 'text-embedding-004',
        fallback_provider: null,
        fallback_model: null,
        requires_json_schema: false,
        requires_embedding: true,
        max_output_tokens: null,
        temperature: null,
      }),
    ]);

    expect(Object.keys(routes).sort()).toEqual(['embedding', 'opportunity_analyzer']);
    expect(routes.embedding).toMatchObject({
      taskType: 'embedding',
      requiresEmbedding: true,
      attempts: [{ provider: 'gemini', model: 'text-embedding-004' }],
    });
  });
});

describe('AiRoutingService.loadActiveRoutes', () => {
  it('reads the active route rows from Supabase and returns the mapped overrides', async () => {
    const eq = jest.fn().mockResolvedValue({ data: [makeRouteRow()], error: null });
    const select = jest.fn(() => ({ eq }));
    const from = jest.fn(() => ({ select }));
    const supabase = { from } as unknown as ServiceClient;

    const service = new AiRoutingService(supabase);
    const routes = await service.loadActiveRoutes();

    expect(from).toHaveBeenCalledWith('ai_task_routes');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('is_active', true);
    expect(routes.opportunity_analyzer).toMatchObject({
      taskType: 'opportunity_analyzer',
      attempts: [
        { provider: 'gemini', model: 'gemini-1.5-flash' },
        { provider: 'groq', model: 'llama-3.1-8b-instant' },
      ],
    });
  });
});
