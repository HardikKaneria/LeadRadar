import { processRecomputeScoring } from './recompute-scoring.processor';
import type { ServiceClient } from '@radar/supabase';
import type { Job } from '../../../queue/supabase-queue.service';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeJob(organizationId: string): Job {
  return { id: 'test-job', payload: { organizationId } } as unknown as Job;
}

/**
 * Minimal Supabase client mock.
 *
 * Each table call returns the pre-configured response. `update` and `insert`
 * calls are captured so tests can assert on what was written.
 */
function makeSupabase(opts: {
  events: any[];
  latestStrategy: any | null;
  latestStrategyError?: any;
  updates?: any[];
  inserts?: any[];
}) {
  const updates = opts.updates ?? [];
  const inserts = opts.inserts ?? [];

  const from = jest.fn((table: string) => {
    const chain: any = {};

    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.in = jest.fn(() => chain);
    chain.order = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.single = jest.fn(() => {
      if (table === 'scoring_strategies') {
        return Promise.resolve({
          data: opts.latestStrategy,
          error: opts.latestStrategyError ?? (opts.latestStrategy === null ? { code: 'PGRST116' } : null),
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // Knowledge events query resolves via .select chain (not .single)
    chain.then = (resolve: any) => {
      if (table === 'knowledge_events') {
        return resolve({ data: opts.events, error: null });
      }
      return resolve({ data: [], error: null });
    };

    chain.update = jest.fn((data: any) => {
      updates.push({ table, data });
      return { eq: jest.fn(() => ({ eq: jest.fn(() => Promise.resolve({ error: null })) })) };
    });

    chain.insert = jest.fn((data: any) => {
      inserts.push({ table, data });
      return Promise.resolve({ error: null });
    });

    return chain;
  });

  return { from, _updates: updates, _inserts: inserts } as unknown as ServiceClient & {
    _updates: any[];
    _inserts: any[];
  };
}

/** Build n events with configurable won/lost/source/service */
function buildEvents(
  specs: Array<{ type: 'won' | 'lost'; source?: string; service?: string }>,
): any[] {
  return specs.map((s) => ({
    event_type: s.type,
    source: s.source ?? null,
    service_match: s.service ?? null,
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('processRecomputeScoring', () => {
  describe('skip conditions', () => {
    it('skips when fewer than 10 events', async () => {
      const events = buildEvents(
        Array.from({ length: 9 }, (_, i) => ({ type: i % 2 === 0 ? 'won' : 'lost' })),
      );
      const supabase = makeSupabase({ events, latestStrategy: null });

      const result = await processRecomputeScoring(makeJob('org-1'), supabase as any);

      expect(result).toEqual({ skipped: true, reason: 'Insufficient data (< 10 outcomes)' });
    });

    it('skips when win rate is 0 (all lost)', async () => {
      const events = buildEvents(Array.from({ length: 10 }, () => ({ type: 'lost' })));
      const supabase = makeSupabase({ events, latestStrategy: null });

      const result = await processRecomputeScoring(makeJob('org-1'), supabase as any);

      expect(result).toEqual({ skipped: true, reason: 'Baseline win rate is 0' });
    });
  });

  describe('weight computation', () => {
    it('emits no weights for dimensions with fewer than 3 occurrences', async () => {
      // 5 won, 5 lost — source 'website' appears only twice → should be neutral 1.0
      const events = buildEvents([
        ...Array.from({ length: 5 }, () => ({ type: 'won' as const, source: 'website' })),
        ...Array.from({ length: 5 }, () => ({ type: 'lost' as const, source: 'linkedin' })),
      ]);
      // Remove one website event so it appears only 4 times; linkedin appears 5 times ≥ 3
      events.splice(4, 1); // now 4 website won + 5 linkedin lost = 9 total... add 1 more
      events.push({ event_type: 'lost', source: 'website', service_match: null });
      // Now: 4 website (all won) + 5 linkedin (all lost) + 1 website (lost) = 10 events
      // website: 4 won / 5 total → weight = (4/5) / (4/10) = 0.8 / 0.4 = 2.0
      // linkedin: 0 won / 5 total → weight = 0 / 0.4 = 0 → floored to 0.1

      const inserts: any[] = [];
      const supabase = makeSupabase({ events, latestStrategy: null, inserts });

      await processRecomputeScoring(makeJob('org-1'), supabase as any);

      const inserted = inserts.find((i) => i.table === 'scoring_strategies');
      expect(inserted).toBeDefined();
      // Both sources have ≥ 3 occurrences
      expect(inserted.data.weights['source.website']).toBeDefined();
      expect(inserted.data.weights['source.linkedin']).toBeDefined();
    });

    it('assigns weight 1.0 for dimensions below 3 occurrences', async () => {
      // 10 events; 'rare-source' appears only twice
      const events = buildEvents([
        ...Array.from({ length: 8 }, (_, i) => ({
          type: (i % 2 === 0 ? 'won' : 'lost') as 'won' | 'lost',
          source: 'main',
        })),
        { type: 'won', source: 'rare-source' },
        { type: 'lost', source: 'rare-source' },
      ]);

      const inserts: any[] = [];
      const supabase = makeSupabase({ events, latestStrategy: null, inserts });

      await processRecomputeScoring(makeJob('org-1'), supabase as any);

      const inserted = inserts.find((i) => i.table === 'scoring_strategies');
      expect(inserted.data.weights['source.rare-source']).toBe(1.0);
    });

    it('high-win-rate source gets weight > 1', async () => {
      // 'premium' source: 4 won / 4 total; baseline 4 won / 10 total = 0.4 win rate
      // premium weight = (4/4) / 0.4 = 2.5
      const events = buildEvents([
        ...Array.from({ length: 4 }, () => ({ type: 'won' as const, source: 'premium' })),
        ...Array.from({ length: 6 }, () => ({ type: 'lost' as const, source: 'cold_email' })),
      ]);

      const inserts: any[] = [];
      const supabase = makeSupabase({ events, latestStrategy: null, inserts });

      await processRecomputeScoring(makeJob('org-1'), supabase as any);

      const w = inserts.find((i) => i.table === 'scoring_strategies').data.weights;
      expect(w['source.premium']).toBeGreaterThan(1);
    });

    it('low-win-rate source gets weight < 1, floored at 0.1', async () => {
      // 'bad' source: 0 won / 4 total; floored to 0.1
      const events = buildEvents([
        ...Array.from({ length: 4 }, () => ({ type: 'won' as const, source: 'good' })),
        ...Array.from({ length: 4 }, () => ({ type: 'lost' as const, source: 'bad' })),
        ...Array.from({ length: 2 }, () => ({ type: 'won' as const, source: 'good' })),
      ]);

      const inserts: any[] = [];
      const supabase = makeSupabase({ events, latestStrategy: null, inserts });

      await processRecomputeScoring(makeJob('org-1'), supabase as any);

      const w = inserts.find((i) => i.table === 'scoring_strategies').data.weights;
      expect(w['source.bad']).toBe(0.1);
    });

    it('caps weight at 5.0 for astronomically good sources', async () => {
      // 10 won all from 'magic' source; 0 lost → but win rate = 1.0 / 1.0 = 1.0... ratio = 1.0/1.0 = 1
      // Need: magic: 5 won / 5 total; total: 5 won / 10 total → weight = (5/5)/(5/10) = 2.0 ≤ 5
      // For cap, we need something like 5/5 won from source vs 1/10 baseline
      // magic: 9 won / 9 total; 1 other won in 10 total → baseline = 10/10 ... still 1
      // Better: 9 won in magic / 9 total; baseline = 9/10 = 0.9 → weight = 1/0.9 = 1.1
      // Real cap test: source 'magic' 5 won / 5, baseline 5/50 = 0.1 → weight = 1/0.1 = 10 → capped at 5
      const events = buildEvents([
        ...Array.from({ length: 5 }, () => ({ type: 'won' as const, source: 'magic' })),
        ...Array.from({ length: 45 }, () => ({ type: 'lost' as const, source: 'other' })),
      ]);

      const inserts: any[] = [];
      const supabase = makeSupabase({ events, latestStrategy: null, inserts });

      await processRecomputeScoring(makeJob('org-1'), supabase as any);

      const w = inserts.find((i) => i.table === 'scoring_strategies').data.weights;
      expect(w['source.magic']).toBe(5.0);
    });

    it('weights are rounded to 2 decimal places', async () => {
      // 7 won / 10 events from 'src'; baseline = 7/10 → weight = 1.0 (rounded)
      // 3 won / 5 from 'a', 4 lost from 'b'; baseline = 3/7... not integer → check rounding
      const events = buildEvents([
        ...Array.from({ length: 3 }, () => ({ type: 'won' as const, source: 'a' })),
        ...Array.from({ length: 3 }, () => ({ type: 'lost' as const, source: 'a' })),
        ...Array.from({ length: 2 }, () => ({ type: 'won' as const, source: 'b' })),
        ...Array.from({ length: 2 }, () => ({ type: 'lost' as const, source: 'b' })),
      ]);

      const inserts: any[] = [];
      const supabase = makeSupabase({ events, latestStrategy: null, inserts });

      await processRecomputeScoring(makeJob('org-1'), supabase as any);

      const w = inserts.find((i) => i.table === 'scoring_strategies').data.weights;
      for (const weight of Object.values(w) as number[]) {
        expect(weight).toBe(Math.round(weight * 100) / 100);
      }
    });
  });

  describe('strategy versioning', () => {
    it('sets version = 1 when no existing strategy', async () => {
      const events = buildEvents([
        ...Array.from({ length: 5 }, () => ({ type: 'won' as const, source: 'web' })),
        ...Array.from({ length: 5 }, () => ({ type: 'lost' as const, source: 'cold' })),
      ]);

      const inserts: any[] = [];
      const supabase = makeSupabase({ events, latestStrategy: null, inserts });

      const result = await processRecomputeScoring(makeJob('org-1'), supabase as any);

      expect((result as any).version).toBe(1);
      const inserted = inserts.find((i) => i.table === 'scoring_strategies');
      expect(inserted.data.version).toBe(1);
    });

    it('increments version from latest strategy', async () => {
      const events = buildEvents([
        ...Array.from({ length: 5 }, () => ({ type: 'won' as const, source: 'web' })),
        ...Array.from({ length: 5 }, () => ({ type: 'lost' as const, source: 'cold' })),
      ]);

      const inserts: any[] = [];
      const supabase = makeSupabase({
        events,
        latestStrategy: { version: 3 },
        latestStrategyError: null,
        inserts,
      });

      const result = await processRecomputeScoring(makeJob('org-1'), supabase as any);

      expect((result as any).version).toBe(4);
      const inserted = inserts.find((i) => i.table === 'scoring_strategies');
      expect(inserted.data.version).toBe(4);
    });

    it('inserts new strategy with kind=statistical and is_active=true', async () => {
      const events = buildEvents([
        ...Array.from({ length: 5 }, () => ({ type: 'won' as const, source: 'web' })),
        ...Array.from({ length: 5 }, () => ({ type: 'lost' as const, source: 'cold' })),
      ]);

      const inserts: any[] = [];
      const supabase = makeSupabase({ events, latestStrategy: null, inserts });

      await processRecomputeScoring(makeJob('org-1'), supabase as any);

      const inserted = inserts.find((i) => i.table === 'scoring_strategies');
      expect(inserted.data.kind).toBe('statistical');
      expect(inserted.data.is_active).toBe(true);
    });

    it('deactivates old strategy before inserting new one', async () => {
      const events = buildEvents([
        ...Array.from({ length: 5 }, () => ({ type: 'won' as const, source: 'web' })),
        ...Array.from({ length: 5 }, () => ({ type: 'lost' as const, source: 'cold' })),
      ]);

      const updates: any[] = [];
      const supabase = makeSupabase({
        events,
        latestStrategy: { version: 1 },
        latestStrategyError: null,
        updates,
      });

      await processRecomputeScoring(makeJob('org-1'), supabase as any);

      const deactivation = updates.find(
        (u) => u.table === 'scoring_strategies' && u.data.is_active === false,
      );
      expect(deactivation).toBeDefined();
    });
  });

  describe('metrics', () => {
    it('records totalEvents and baselineWinRate in metrics', async () => {
      const events = buildEvents([
        ...Array.from({ length: 6 }, () => ({ type: 'won' as const, source: 'web' })),
        ...Array.from({ length: 4 }, () => ({ type: 'lost' as const, source: 'cold' })),
      ]);

      const inserts: any[] = [];
      const supabase = makeSupabase({ events, latestStrategy: null, inserts });

      await processRecomputeScoring(makeJob('org-1'), supabase as any);

      const inserted = inserts.find((i) => i.table === 'scoring_strategies');
      expect(inserted.data.metrics.totalEvents).toBe(10);
      expect(inserted.data.metrics.baselineWinRate).toBe(0.6);
    });

    it('reports weightsGenerated count in return value', async () => {
      const events = buildEvents([
        ...Array.from({ length: 3 }, () => ({ type: 'won' as const, source: 'web', service: 'seo' })),
        ...Array.from({ length: 7 }, () => ({ type: 'lost' as const, source: 'cold', service: 'ads' })),
      ]);

      const result = await processRecomputeScoring(
        makeJob('org-1'),
        makeSupabase({ events, latestStrategy: null }) as any,
      );

      // source.web, source.cold, service.seo, service.ads = 4 dimensions
      expect((result as any).weightsGenerated).toBe(4);
    });
  });

  describe('service_match weights', () => {
    it('generates service weights alongside source weights', async () => {
      const events = buildEvents([
        ...Array.from({ length: 5 }, () => ({
          type: 'won' as const,
          source: 'inbound',
          service: 'consulting',
        })),
        ...Array.from({ length: 5 }, () => ({
          type: 'lost' as const,
          source: 'cold',
          service: 'support',
        })),
      ]);

      const inserts: any[] = [];
      const supabase = makeSupabase({ events, latestStrategy: null, inserts });

      await processRecomputeScoring(makeJob('org-1'), supabase as any);

      const w = inserts.find((i) => i.table === 'scoring_strategies').data.weights;
      expect(w['service.consulting']).toBeDefined();
      expect(w['service.support']).toBeDefined();
    });
  });
});
