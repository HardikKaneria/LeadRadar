import type { ServiceClient } from '@radar/supabase';
import type { Job } from '../../../queue/supabase-queue.service';

export interface RecomputeHeatPayload {
  organizationId: string;
}

/**
 * Recompute heat scores for all open/qualified opportunities in an org.
 *
 * Heat formula:
 *   base_heat = ai_score * 0.7 + priority_weight * 0.3
 *   time_decay = max(0.2, 1 - age_days / 180)  → heat halves by 90 days, floors at 20%
 *   strategy_multiplier = strategy weight for the opp's source × service_match
 *   heat = clamp(base_heat * time_decay * strategy_multiplier, 0, 100)
 *
 * Expiry:
 *   heat >= 70 → expires in 60 days from last analysis
 *   heat >= 40 → 30 days
 *   otherwise  → 14 days
 *
 * After computing, opportunities whose expires_at falls within the next 48 h get an
 * `opportunity_expiring` notification sent to their owner (de-duplicated per day).
 */
export async function recomputeHeat(job: Job, supabase: ServiceClient) {
  const { organizationId } = job.payload as RecomputeHeatPayload;
  if (!organizationId) throw new Error('No organizationId in payload');

  // Load the active scoring strategy weights for this org.
  const { data: strategy } = await supabase
    .from('scoring_strategies')
    .select('weights')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .single();

  const weights: Record<string, number> = (strategy?.weights as Record<string, number>) ?? {};

  // Fetch all open / qualified opportunities.
  const { data: opps, error } = await supabase
    .from('opportunities')
    .select('id, score, priority_weight, owner_id, created_at')
    .eq('organization_id', organizationId)
    .in('status', ['open', 'qualified'])
    .is('deleted_at', null);

  if (error) throw error;
  if (!opps || opps.length === 0) return;

  const now = new Date();
  const nowMs = now.getTime();

  const updates: Array<{ id: string; heat_score: number; expires_at: string }> = [];

  for (const opp of opps) {
    const aiScore = opp.score ?? 0;
    const priorityWeight = opp.priority_weight ?? 25;
    const ageDays = (nowMs - new Date(opp.created_at).getTime()) / (1000 * 60 * 60 * 24);

    const baseHeat = aiScore * 0.7 + priorityWeight * 0.3;
    const timeDecay = Math.max(0.2, 1 - ageDays / 180);

    // Strategy multiplier defaults to 1.0 (no source/service columns on opportunities yet).
    const strategyMult = 1.0;

    const heat = Math.min(100, Math.max(0, baseHeat * timeDecay * strategyMult));

    // Expiry window based on heat band.
    const expiryDays = heat >= 70 ? 60 : heat >= 40 ? 30 : 14;
    const expiresAt = new Date(nowMs + expiryDays * 24 * 60 * 60 * 1000);

    updates.push({
      id: opp.id,
      heat_score: Math.round(heat * 100) / 100,
      expires_at: expiresAt.toISOString(),
    });
  }

  // Batch-update in chunks of 50.
  const CHUNK = 50;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    for (const u of chunk) {
      await supabase
        .from('opportunities')
        .update({ heat_score: u.heat_score, expires_at: u.expires_at })
        .eq('id', u.id);
    }
  }

  // Fire `opportunity_expiring` notifications for deals expiring within 48 h.
  const in48h = new Date(nowMs + 48 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(nowMs);
  todayStart.setUTCHours(0, 0, 0, 0);

  const expiringSoon = updates.filter((u) => u.expires_at <= in48h);

  for (const u of expiringSoon) {
    const opp = opps.find((o) => o.id === u.id);
    if (!opp?.owner_id) continue;

    // De-duplicate: skip if already notified today.
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', opp.owner_id)
      .eq('type', 'opportunity_expiring')
      .filter('data->>opportunityId', 'eq', opp.id)
      .gte('created_at', todayStart.toISOString())
      .limit(1);

    if (existing && existing.length > 0) continue;

    await supabase.from('notifications').insert({
      organization_id: organizationId,
      user_id: opp.owner_id,
      type: 'opportunity_expiring',
      status: 'unread',
      data: {
        opportunityId: opp.id,
        expiresAt: u.expires_at,
        heatScore: u.heat_score,
        message: `An opportunity is expiring soon (heat ${Math.round(u.heat_score)}).`,
      },
    });
  }
}
