import { NotificationsService } from './notifications.service';
import type { ServiceClient } from '@radar/supabase';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let supabase: any;
  let updates: any[] = [];

  beforeEach(() => {
    updates = [];
    
    const mockFrom = jest.fn((table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        single: () => chain,
        then: (resolve: any) => {
          if (table === 'notifications') {
            resolve({ data: [{ id: 'notif-1', user_id: 'u-1', type: 'general' }], error: null });
          } else if (table === 'notification_preferences') {
            resolve({ data: { user_id: 'u-1', notify_lead_stale: true }, error: null });
          }
        },
      };

      return {
        select: () => chain,
        update: (payload: any) => {
          updates.push({ table, payload });
          // return a chain that resolves with error: null
          const updateChain: any = {
            eq: () => updateChain,
            then: (resolve: any) => resolve({ error: null })
          };
          return updateChain;
        },
        upsert: (payload: any) => ({
          select: () => ({
            single: () => ({
              then: (resolve: any) => {
                resolve({ data: { ...payload, updated_at: 'now' }, error: null });
              }
            })
          })
        }),
      };
    });

    supabase = { from: mockFrom };
    service = new NotificationsService(supabase as unknown as ServiceClient);
  });

  it('should list notifications', async () => {
    const notifs = await service.listNotifications('u-1');
    expect(notifs).toHaveLength(1);
    expect((notifs as any)[0].id).toBe('notif-1');
  });

  it('should mark notification as read', async () => {
    await service.markAsRead('u-1', 'notif-1', { status: 'read' });
    expect(updates).toHaveLength(1);
    expect(updates[0].payload.status).toBe('read');
  });

  it('should fetch preferences with defaults if none exist', async () => {
    // Override to simulate PGRST116 (Not found)
    supabase.from = jest.fn(() => ({
      select: () => ({
        eq: () => ({
          single: () => ({
            then: (resolve: any) => resolve({ data: null, error: { code: 'PGRST116' } })
          })
        })
      })
    }));

    const prefs = await service.getPreferences('u-1', 'org-1');
    expect(prefs.notifyLeadStale).toBe(true);
    expect(prefs.notifyFollowUpDue).toBe(true);
  });

  it('should update preferences', async () => {
    const prefs = await service.updatePreferences('u-1', 'org-1', { notifyLeadStale: false });
    expect(prefs.notifyLeadStale).toBe(false);
  });
});
