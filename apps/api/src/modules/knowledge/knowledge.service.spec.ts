import { KnowledgeService } from './knowledge.service';
import type { ServiceClient } from '@radar/supabase';

function makeSupabase(opts: { data: any[] }) {
  const from = jest.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      gte: () => chain,
      order: () => chain,
      range: () => chain,
      then: (resolve: any) => resolve({ data: opts.data, error: null, count: opts.data.length }),
    });
    return chain;
  });

  return { from } as unknown as ServiceClient;
}

describe('KnowledgeService', () => {
  it('lists events', async () => {
    const supabase = makeSupabase({ data: [{ id: '1', event_type: 'won' }] });
    const queueService = { enqueue: jest.fn() } as any;
    const service = new KnowledgeService(supabase, queueService);

    const result = await service.listEvents('org-1', 10, 0);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('aggregates conversion insights by source', async () => {
    const supabase = makeSupabase({
      data: [
        { event_type: 'won', source: 'inbound', score: 90, value: 1000 },
        { event_type: 'lost', source: 'inbound', score: 80, value: 500 },
        { event_type: 'won', source: 'referral', score: 50, value: 2000 },
      ],
    });
    const queueService = { enqueue: jest.fn() } as any;
    const service = new KnowledgeService(supabase, queueService);

    const result = await service.getConversionInsights('org-1', { timeframeDays: 30, groupBy: 'source' });
    
    expect(result.data).toHaveLength(2);
    
    const inbound = result.data.find((r: any) => r.group === 'inbound')!;
    expect(inbound.totalLeads).toBe(2);
    expect(inbound.wonLeads).toBe(1);
    expect(inbound.winRate).toBe(50);
    expect(inbound.avgScore).toBe(85); // (90 + 80) / 2
    expect(inbound.avgValue).toBe(750);
    
    const referral = result.data.find((r: any) => r.group === 'referral')!;
    expect(referral.totalLeads).toBe(1);
    expect(referral.wonLeads).toBe(1);
    expect(referral.winRate).toBe(100);
    expect(referral.avgScore).toBe(50);
  });

  it('aggregates reason insights', async () => {
    const supabase = makeSupabase({
      data: [
        { event_type: 'lost', reason: 'Too expensive' },
        { event_type: 'lost', reason: 'Too expensive' },
        { event_type: 'lost', reason: 'Competitor' },
        { event_type: 'on_hold', reason: 'Budget frozen' },
      ],
    });
    const queueService = { enqueue: jest.fn() } as any;
    const service = new KnowledgeService(supabase, queueService);

    const result = await service.getReasonInsights('org-1', { timeframeDays: 30, groupBy: 'source' });
    
    expect(result.lost).toHaveLength(2);
    expect(result.lost[0]!.reason).toBe('Too expensive');
    expect(result.lost[0]!.count).toBe(2);
    expect(result.lost[1]!.reason).toBe('Competitor');
    expect(result.lost[1]!.count).toBe(1);
    
    expect(result.onHold).toHaveLength(1);
    expect(result.onHold[0]!.reason).toBe('Budget frozen');
    expect(result.onHold[0]!.count).toBe(1);
  });
});
