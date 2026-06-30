import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), 'apps', 'api', '.env') });
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: routes } = await supabase.from('ai_task_routes').select('task_type, primary_provider, primary_model');
  for (const route of routes) {
    if (route.task_type !== 'embedding' && route.primary_provider === 'gemini') {
       await supabase.from('ai_task_routes').update({
         fallback_provider: 'groq',
         fallback_model: 'llama-3.1-8b-instant'
       }).eq('task_type', route.task_type);
       console.log(`Updated fallback for ${route.task_type}`);
    }
  }
}
run();
