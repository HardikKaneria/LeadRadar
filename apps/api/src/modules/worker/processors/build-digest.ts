import type { ServiceClient } from '@radar/supabase';
import type { Job } from '../../../queue/supabase-queue.service';

export interface BuildDigestPayload {
  organizationId: string;
}

/**
 * Daily digest job — summarises each user's open tasks + overdue follow-ups into a single
 * `general` notification. Skips users who already have an unread digest for today.
 */
export async function buildDigest(job: Job, supabase: ServiceClient) {
  const { organizationId } = job.payload as BuildDigestPayload;
  if (!organizationId) throw new Error('No organizationId provided');

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Fetch all members of the org.
  const { data: members, error: memErr } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('status', 'active');
  if (memErr) throw memErr;
  if (!members || members.length === 0) return;

  for (const { user_id } of members) {
    // Skip if we already sent a digest today.
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', user_id)
      .eq('type', 'general')
      .gte('created_at', todayStart.toISOString())
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Count overdue tasks assigned to this user.
    const { count: overdueCount } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('assigned_to', user_id)
      .eq('status', 'open')
      .lt('due_at', new Date().toISOString())
      .is('deleted_at', null);

    // Count tasks due today.
    const todayEnd = new Date(todayStart);
    todayEnd.setUTCHours(23, 59, 59, 999);
    const { count: dueTodayCount } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('assigned_to', user_id)
      .eq('status', 'open')
      .gte('due_at', todayStart.toISOString())
      .lte('due_at', todayEnd.toISOString())
      .is('deleted_at', null);

    const overdue = overdueCount ?? 0;
    const dueToday = dueTodayCount ?? 0;

    if (overdue === 0 && dueToday === 0) continue;

    const parts: string[] = [];
    if (overdue > 0) parts.push(`${overdue} overdue task${overdue > 1 ? 's' : ''}`);
    if (dueToday > 0) parts.push(`${dueToday} task${dueToday > 1 ? 's' : ''} due today`);

    await supabase.from('notifications').insert({
      organization_id: organizationId,
      user_id,
      type: 'general',
      status: 'unread',
      data: {
        message: `Daily digest: ${parts.join(', ')}.`,
        overdueTasks: overdue,
        dueTodayTasks: dueToday,
      },
    });
  }
}
