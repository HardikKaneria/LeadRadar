import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'apps/api/.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: job } = await supabase
    .from('job_runs')
    .select('error')
    .eq('job_name', 'generate-embedding')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  console.log("Job Error:", job?.error);
}
run();
