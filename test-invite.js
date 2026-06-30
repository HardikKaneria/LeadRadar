require('dotenv').config({ path: 'apps/api/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.auth.admin.inviteUserByEmail('test-rate-limit123@example.com').then(console.log).catch(console.error);
