/**
 * LeadRadar E2E Simulation Script
 * 
 * This script simulates the full cross-feature E2E flow:
 * Capture -> Analyze -> Approve -> Lead -> Proposal -> Won
 * 
 * Usage:
 *   npx ts-node scripts/simulate-e2e.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from the api package .env
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function simulate() {
  console.log('--- Starting LeadRadar E2E Simulation ---');

  // We assume there's at least one organization in the local DB.
  const { data: orgs, error: orgError } = await supabase.from('organizations').select('*').limit(1);
  if (orgError || !orgs || orgs.length === 0) {
    console.error('No organization found to run simulation against.', orgError);
    return;
  }
  const org = orgs[0];
  console.log(`[1] Found organization: ${org.name} (${org.id})`);

  // 1. Capture Discovery
  console.log('[2] Simulating Discovery Capture...');
  const { data: discovery, error: discError } = await supabase.from('discoveries').insert({
    organization_id: org.id,
    batch_id: null,
    company_name: 'Acme E2E Corp',
    description: 'Simulated company looking for CRM software.',
    status: 'new',
    dedup_hash: `e2e-hash-${Date.now()}`,
    raw_payload: { source: 'e2e-script' },
  }).select().single();

  if (discError || !discovery) {
    console.error('Failed to create discovery:', discError);
    return;
  }
  console.log(`    -> Discovery created: ${discovery.id}`);

  // 2. Simulate AI Analysis
  console.log('[3] Simulating AI Pipeline Analysis...');
  const { error: analysisError } = await supabase.from('ai_analysis').insert({
    organization_id: org.id,
    discovery_id: discovery.id,
    model: 'gpt-4',
    prompt_version_id: null,
    score: 85,
    heat: 70,
    metrics: { fit: 'high', urgency: 'medium' },
    reasoning: 'Matches E2E test criteria perfectly.',
  });

  const { error: planError } = await supabase.from('ai_action_plans').insert({
    organization_id: org.id,
    discovery_id: discovery.id,
    model: 'gpt-4',
    recommended_priority: 'high',
    recommended_weight: 90,
    steps: ['Reach out to CEO', 'Send E2E proposal'],
  });

  if (analysisError || planError) {
    console.error('Failed to insert AI analysis/plan:', analysisError, planError);
    return;
  }
  console.log('    -> Analysis and Plan attached.');

  // 3. Approve Discovery -> Convert to Opportunity
  console.log('[4] Simulating Discovery Approval (convert to opportunity)...');
  const { data: rpcData, error: rpcError } = await supabase.rpc('convert_discovery_to_opportunity', {
    p_discovery: discovery.id,
    p_force: true // Force conversion ignoring threshold
  });

  if (rpcError) {
    console.error('Failed to convert discovery (RPC error):', rpcError);
    return;
  }
  console.log('    -> Discovery converted. Opportunity created.');

  // The RPC returns the created opportunity. Let's fetch it to be sure.
  const { data: opp, error: oppError } = await supabase.from('opportunities')
    .select('*')
    .eq('discovery_id', discovery.id)
    .single();

  if (oppError || !opp) {
    console.error('Failed to fetch created opportunity:', oppError);
    return;
  }
  console.log(`    -> Opportunity ID: ${opp.id}, Status: ${opp.status}`);

  // 4. Convert Opportunity to Lead (e.g. they replied)
  console.log('[5] Simulating Opportunity Promotion to Lead...');
  const { error: promoteError } = await supabase.rpc('promote_opportunity_to_lead', {
    p_opportunity: opp.id,
  });

  if (promoteError) {
    console.error('Failed to promote opportunity:', promoteError);
    return;
  }

  const { data: lead, error: leadError } = await supabase.from('leads')
    .select('*')
    .eq('opportunity_id', opp.id)
    .single();

  if (leadError || !lead) {
    console.error('Failed to fetch created lead:', leadError);
    return;
  }
  console.log(`    -> Lead ID: ${lead.id}, Status: ${lead.status}`);

  // 5. Simulate Proposal & Won
  console.log('[6] Simulating Proposal & Deal Won...');
  const { error: updateLeadError } = await supabase.from('leads')
    .update({ status: 'negotiating' })
    .eq('id', lead.id);

  if (updateLeadError) {
    console.error('Failed to update lead status:', updateLeadError);
    return;
  }
  console.log('    -> Lead status updated to "negotiating"');

  const { error: closeError } = await supabase.rpc('close_lead', {
    p_lead: lead.id,
    p_status: 'won',
    p_value: 15000,
  });

  if (closeError) {
    console.error('Failed to close lead:', closeError);
    return;
  }

  console.log('    -> Lead closed as "won" with value 15000.');

  // 6. Check Billing / Usage
  console.log('[7] Simulating Data Export / Billing check...');
  const { data: billing, error: beError } = await supabase.from('opportunities').select('id', { count: 'exact' }).eq('organization_id', org.id);
  console.log(`    -> Total Opportunities tracked for org: ${billing?.length ?? 0}`);

  console.log('--- E2E Simulation Completed Successfully ---');
}

simulate().catch(console.error);
