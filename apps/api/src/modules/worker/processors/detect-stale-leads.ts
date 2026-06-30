import type { ServiceClient } from '@radar/supabase';

export async function detectStaleLeads(supabase: ServiceClient) {
  // 1. Fetch active leads that might need notifications.
  // Note: We need all leads that are active and don't have a closed/done status.
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select(`
      id, organization_id, assignee_id, status, created_at, updated_at,
      tasks (
        id, status, due_at
      )
    `)
    .in('status', ['new', 'engaging', 'negotiating']);

  if (leadsErr) {
    console.error('Failed to fetch leads for stale detection', leadsErr);
    return;
  }

  const now = new Date();

  // 2. Identify issues
  for (const lead of (leads || [])) {
    if (!lead.assignee_id) continue;

    const openTasks = (lead.tasks || []).filter((t: any) => t.status === 'open');
    const hasOpenTask = openTasks.length > 0;
    const isStale = !hasOpenTask && (now.getTime() - new Date(lead.updated_at).getTime() > 3 * 24 * 60 * 60 * 1000); // 3 days no activity
    
    let dueTask = false;
    let overdueTask = false;

    if (hasOpenTask) {
      for (const task of openTasks) {
        if (!task.due_at) continue;
        const dueDate = new Date(task.due_at);
        if (dueDate < now && now.getTime() - dueDate.getTime() > 24 * 60 * 60 * 1000) {
          overdueTask = true;
        } else if (dueDate <= now) {
          dueTask = true;
        }
      }
    }

    // 3. Check preferences and insert notifications
    if (isStale || dueTask || overdueTask) {
      const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', lead.assignee_id)
        .single();
        
      const notifyStale = prefs ? prefs.notify_lead_stale : true;
      const notifyDue = prefs ? prefs.notify_follow_up_due : true;
      const notifyOverdue = prefs ? prefs.notify_follow_up_overdue : true;

      const notificationsToInsert = [];

      if (isStale && notifyStale) {
        notificationsToInsert.push({
          organization_id: lead.organization_id,
          user_id: lead.assignee_id,
          type: 'lead_stale',
          data: { leadId: lead.id, message: 'Lead has been inactive for over 3 days without any open tasks.' }
        });
      }

      if (overdueTask && notifyOverdue) {
        notificationsToInsert.push({
          organization_id: lead.organization_id,
          user_id: lead.assignee_id,
          type: 'follow_up_overdue',
          data: { leadId: lead.id, message: 'You have an overdue follow-up task.' }
        });
      } else if (dueTask && notifyDue) {
        notificationsToInsert.push({
          organization_id: lead.organization_id,
          user_id: lead.assignee_id,
          type: 'follow_up_due',
          data: { leadId: lead.id, message: 'You have a follow-up task due today.' }
        });
      }

      for (const notif of notificationsToInsert) {
        // Prevent spam: Check if a similar notification was sent in the last 24 hours
        const { data: recent } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', notif.user_id)
          .eq('type', notif.type)
          .eq('status', 'unread')
          .gte('created_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        // We could also check JSON data for exact leadId match in a real scenario
        if (!recent || recent.length === 0) {
          await supabase.from('notifications').insert(notif);
        }
      }
    }
  }
}
