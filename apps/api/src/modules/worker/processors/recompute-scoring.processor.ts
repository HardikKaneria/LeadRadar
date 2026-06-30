import type { ServiceClient } from '@radar/supabase';
import type { Job } from '../../../queue/supabase-queue.service';

export interface RecomputeScoringJobPayload {
  organizationId: string;
}

export async function processRecomputeScoring(
  job: Job,
  supabase: ServiceClient,
) {
  const { organizationId } = job.payload as RecomputeScoringJobPayload;
  if (!organizationId) {
    throw new Error('No organizationId provided in job payload');
  }

  // 1. Fetch historical conversion events
  const { data: events, error: eventsErr } = await supabase
    .from('knowledge_events')
    .select('event_type, source, service_match')
    .eq('organization_id', organizationId)
    .in('event_type', ['won', 'lost']);

  if (eventsErr) throw eventsErr;

  if (!events || events.length < 10) {
    // Not enough data to be statistically significant
    return { skipped: true, reason: 'Insufficient data (< 10 outcomes)' };
  }

  // 2. Calculate baseline
  let totalWon = 0;
  let totalLost = 0;

  // Track by dimensions
  const sourceStats: Record<string, { won: number; total: number }> = {};
  const serviceStats: Record<string, { won: number; total: number }> = {};

  for (const event of events) {
    const isWon = event.event_type === 'won';
    if (isWon) totalWon++;
    else totalLost++;

    if (event.source) {
      if (!sourceStats[event.source]) sourceStats[event.source] = { won: 0, total: 0 };
      sourceStats[event.source]!.total++;
      if (isWon) sourceStats[event.source]!.won++;
    }

    if (event.service_match) {
      if (!serviceStats[event.service_match]) serviceStats[event.service_match] = { won: 0, total: 0 };
      serviceStats[event.service_match]!.total++;
      if (isWon) serviceStats[event.service_match]!.won++;
    }
  }

  const baselineWinRate = totalWon / (totalWon + totalLost);

  if (baselineWinRate === 0) {
    return { skipped: true, reason: 'Baseline win rate is 0' };
  }

  // 3. Compute weights
  // Weight = (Dimensional Win Rate / Baseline)
  // We cap it between 0.1 and 5.0 to prevent absurd edge cases on small subsets.
  const weights: Record<string, number> = {};

  const calculateWeight = (won: number, total: number) => {
    // Minimum 3 occurrences to get a unique weight, otherwise neutral (1.0)
    if (total < 3) return 1.0;
    const rate = won / total;
    let weight = rate / baselineWinRate;
    // Cap weights
    if (weight > 5.0) weight = 5.0;
    if (weight < 0.1) weight = 0.1;
    // Round to 2 decimals
    return Math.round(weight * 100) / 100;
  };

  for (const [source, stats] of Object.entries(sourceStats)) {
    weights[`source.${source}`] = calculateWeight(stats.won, stats.total);
  }

  for (const [service, stats] of Object.entries(serviceStats)) {
    weights[`service.${service}`] = calculateWeight(stats.won, stats.total);
  }

  // 4. Determine next version
  const { data: latestStrategy, error: latestErr } = await supabase
    .from('scoring_strategies')
    .select('version')
    .eq('organization_id', organizationId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (latestErr && latestErr.code !== 'PGRST116') {
    throw latestErr;
  }

  const nextVersion = latestStrategy ? latestStrategy.version + 1 : 1;

  const metrics = {
    totalEvents: events.length,
    baselineWinRate: Math.round(baselineWinRate * 1000) / 1000,
    generatedAt: new Date().toISOString(),
  };

  // 5. Update DB (Deactivate old, Insert new)
  // We don't have true multi-statement transactions in the JS client without RPC,
  // but we can execute them sequentially. The constraint is just one active per org if we enforced it,
  // but actually it's a soft flag. Wait, there is a unique index: `scoring_strategies_active_org_uidx`.
  // So we MUST deactivate before inserting.

  const { error: deactivateErr } = await supabase
    .from('scoring_strategies')
    .update({ is_active: false })
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (deactivateErr) throw deactivateErr;

  const { error: insertErr } = await supabase
    .from('scoring_strategies')
    .insert({
      organization_id: organizationId,
      version: nextVersion,
      kind: 'statistical',
      weights,
      metrics,
      is_active: true,
    });

  if (insertErr) {
    // Attempt rollback of activation if insert fails (best effort)
    await supabase
      .from('scoring_strategies')
      .update({ is_active: true })
      .eq('organization_id', organizationId)
      .eq('version', nextVersion - 1);
    throw insertErr;
  }

  return { 
    success: true, 
    version: nextVersion,
    weightsGenerated: Object.keys(weights).length 
  };
}
