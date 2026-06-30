import type { ServiceClient } from '@radar/supabase';
import type { Job } from '../../../queue/supabase-queue.service';

export interface GenerateWeeklyInsightPayload {
  organizationId: string;
}

export async function generateWeeklyInsight(job: Job, supabase: ServiceClient) {
  const { organizationId } = job.payload as GenerateWeeklyInsightPayload;
  
  if (!organizationId) {
    throw new Error('No organizationId provided in job payload');
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Fetch events
  const { data: events, error: eventsErr } = await supabase
    .from('knowledge_events')
    .select('event_type')
    .eq('organization_id', organizationId)
    .in('event_type', ['won', 'lost'])
    .gte('created_at', cutoff);

  if (eventsErr) {
    throw eventsErr;
  }

  if (!events || events.length === 0) {
    // Nothing to report this week
    return;
  }

  let wonLeads = 0;
  let lostLeads = 0;
  for (const event of events) {
    if (event.event_type === 'won') wonLeads++;
    else if (event.event_type === 'lost') lostLeads++;
  }
  
  const totalLeads = wonLeads + lostLeads;
  const winRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

  // 2. Fetch users in org
  const { data: members, error: memErr } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .in('status', ['active', 'owner']); // fallback safety

  if (memErr) throw memErr;
  if (!members || members.length === 0) return;

  // 3. For each user, check preference and send notification
  for (const member of members) {
    const { data: pref, error: prefErr } = await supabase
      .from('notification_preferences')
      .select('notify_weekly_insight')
      .eq('user_id', member.user_id)
      .single();
      
    // Default to true if no preference row exists (or ignore error if PGRST116)
    const wantsInsight = prefErr ? true : pref?.notify_weekly_insight ?? true;

    if (wantsInsight) {
      await supabase.from('notifications').insert({
        organization_id: organizationId,
        user_id: member.user_id,
        type: 'weekly_insight',
        status: 'unread',
        data: {
          wonLeads,
          lostLeads,
          totalLeads,
          winRate,
        },
      });
    }
  }
}
