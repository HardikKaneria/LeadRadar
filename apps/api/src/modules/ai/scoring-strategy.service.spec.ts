import type { Database, ServiceClient } from '@radar/supabase';
import { DEFAULT_HEURISTIC_SCORING_WEIGHTS } from '@radar/ai';
import {
  mapScoringStrategyRow,
  ScoringStrategyService,
} from './scoring-strategy.service';

type ScoringStrategyRow = Database['public']['Tables']['scoring_strategies']['Row'];

function makeStrategyRow(overrides: Partial<ScoringStrategyRow> = {}): ScoringStrategyRow {
  return {
    id: 'strategy-1',
    organization_id: 'org-1',
    version: 1,
    kind: 'heuristic',
    weights: DEFAULT_HEURISTIC_SCORING_WEIGHTS as unknown as ScoringStrategyRow['weights'],
    metrics: {},
    is_active: true,
    created_by: null,
    created_at: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('mapScoringStrategyRow', () => {
  it('maps the DB row into the active heuristic strategy shape', () => {
    expect(mapScoringStrategyRow(makeStrategyRow())).toEqual({
      id: 'strategy-1',
      organizationId: 'org-1',
      version: 1,
      kind: 'heuristic',
      weights: DEFAULT_HEURISTIC_SCORING_WEIGHTS,
      metrics: {},
      createdAt: '2026-06-23T00:00:00.000Z',
    });
  });

  it('rejects unsupported strategy kinds for the v1 loader', () => {
    expect(() =>
      mapScoringStrategyRow(makeStrategyRow({ kind: 'statistical' })),
    ).toThrow('Unsupported scoring strategy kind');
  });
});

describe('ScoringStrategyService.loadActiveStrategy', () => {
  it('reads the active org strategy from Supabase', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: makeStrategyRow(), error: null });
    const eqActive = jest.fn(() => ({ maybeSingle }));
    const eqOrg = jest.fn(() => ({ eq: eqActive }));
    const select = jest.fn(() => ({ eq: eqOrg }));
    const from = jest.fn(() => ({ select }));
    const supabase = { from } as unknown as ServiceClient;

    const service = new ScoringStrategyService(supabase);
    const strategy = await service.loadActiveStrategy('org-1');

    expect(from).toHaveBeenCalledWith('scoring_strategies');
    expect(select).toHaveBeenCalledWith('*');
    expect(eqOrg).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(eqActive).toHaveBeenCalledWith('is_active', true);
    expect(strategy.weights).toEqual(DEFAULT_HEURISTIC_SCORING_WEIGHTS);
  });
});
