import type { ServiceClient } from '@radar/supabase';
import type { Job } from '../../../queue/supabase-queue.service';

export interface ResurrectLeadsPayload {
  organizationId: string;
}

export async function resurrectLeads(job: Job, supabase: ServiceClient) {
  const { organizationId } = job.payload as ResurrectLeadsPayload;
  
  if (!organizationId) {
    throw new Error('No organizationId provided in job payload');
  }

  // 1. Get resurrection candidates
  const { data: candidates, error: cErr } = await supabase
    .rpc('get_resurrection_candidates', {
      p_organization_id: organizationId,
      p_days_back: 30,
      p_similarity_threshold: 0.15,
    });

  if (cErr) {
    throw cErr;
  }

  if (!candidates || candidates.length === 0) {
    return;
  }

  // 2. Fetch users in org
  const { data: members, error: memErr } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .in('status', ['active', 'owner']);

  if (memErr) throw memErr;
  if (!members || members.length === 0) return;

  // 3. For each user, check preference and send notification for each candidate
  for (const member of members) {
    const { data: pref, error: prefErr } = await supabase
      .from('notification_preferences')
      .select('notify_lead_resurrection')
      .eq('user_id', member.user_id)
      .single();
      
    // Default to true if no preference row exists
    const wantsResurrection = prefErr ? true : pref?.notify_lead_resurrection ?? true;

    if (wantsResurrection) {
      for (const candidate of candidates) {
        // Simple deduplication: Check if we've sent a resurrection notification for this lead in the last 30 days
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: existing, error: exErr } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', member.user_id)
          .eq('type', 'lead_resurrection')
          .gte('created_at', cutoff)
          .contains('data', { leadId: candidate.lead_id })
          .limit(1);
          
        if (!exErr && existing && existing.length > 0) {
          continue; // Already notified recently
        }

        await supabase.from('notifications').insert({
          organization_id: organizationId,
          user_id: member.user_id,
          type: 'lead_resurrection',
          status: 'unread',
          data: {
            leadId: candidate.lead_id,
            leadTitle: candidate.lead_title,
            matchOpportunityId: candidate.match_opportunity_id,
            matchOpportunityTitle: candidate.match_opportunity_title,
            similarity: candidate.similarity,
          },
        });
      }
    }
  }
}
