import { detectStaleLeads } from './detect-stale-leads';
import type { ServiceClient } from '@radar/supabase';

function makeSupabase(leadsData: any[], prefsData: any[], inserted: any[]) {
  const from = jest.fn((table: string) => {
    const chain: any = {
      select: () => chain,
      in: () => chain,
      eq: () => chain,
      gte: () => chain,
      limit: () => chain,
      single: () => chain,
      then: (resolve: any) => {
        if (table === 'leads') resolve({ data: leadsData, error: null });
        else if (table === 'notification_preferences') resolve({ data: prefsData[0], error: null });
        else if (table === 'notifications') resolve({ data: [], error: null });
        else resolve({ data: [], error: null });
      },
    };

    return {
      select: () => chain,
      insert: (data: any) => {
        inserted.push({ table, data });
        return { then: (resolve: any) => resolve({ error: null }) };
      },
    };
  });

  return { from } as unknown as ServiceClient;
}

describe('detectStaleLeads', () => {
  it('detects a stale lead and inserts notification', async () => {
    const threeDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    
    const leads = [
      {
        id: 'lead-1',
        organization_id: 'org-1',
        assignee_id: 'user-1',
        status: 'new',
        updated_at: threeDaysAgo,
        tasks: [],
      }
    ];
    const prefs = [{ user_id: 'user-1', notify_lead_stale: true }];
    const inserted: any[] = [];
    const supabase = makeSupabase(leads, prefs, inserted);

    await detectStaleLeads(supabase);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe('notifications');
    expect(inserted[0].data.type).toBe('lead_stale');
    expect(inserted[0].data.user_id).toBe('user-1');
  });

  it('detects an overdue task', async () => {
    const overdue = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    
    const leads = [
      {
        id: 'lead-1',
        organization_id: 'org-1',
        assignee_id: 'user-1',
        status: 'new',
        updated_at: new Date().toISOString(), // not stale
        tasks: [{ status: 'open', due_at: overdue }],
      }
    ];
    const prefs = [{ user_id: 'user-1', notify_follow_up_overdue: true }];
    const inserted: any[] = [];
    const supabase = makeSupabase(leads, prefs, inserted);

    await detectStaleLeads(supabase);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].data.type).toBe('follow_up_overdue');
  });

  it('respects notification preferences (opt-out)', async () => {
    const threeDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    
    const leads = [
      {
        id: 'lead-1',
        organization_id: 'org-1',
        assignee_id: 'user-1',
        status: 'new',
        updated_at: threeDaysAgo,
        tasks: [],
      }
    ];
    // opted out
    const prefs = [{ user_id: 'user-1', notify_lead_stale: false }];
    const inserted: any[] = [];
    const supabase = makeSupabase(leads, prefs, inserted);

    await detectStaleLeads(supabase);

    expect(inserted).toHaveLength(0); // should not insert
  });
});
