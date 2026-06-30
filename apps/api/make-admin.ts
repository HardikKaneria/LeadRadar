import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: './apps/api/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const email = 'hardik@hkrafted.com';
  
  // 1. Get user ID
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    console.error("Failed to list users:", userError);
    return;
  }
  
  const user = users.users.find(u => u.email === email);
  if (!user) {
    console.error(`User with email ${email} not found.`);
    return;
  }
  
  console.log(`Found user ${email} with ID ${user.id}`);
  
  // 2. Insert into platform_admins
  const { error: insertError } = await supabase
    .from('platform_admins')
    .upsert({ user_id: user.id }, { onConflict: 'user_id' });
    
  if (insertError) {
    console.error("Failed to insert into platform_admins:", insertError);
    return;
  }
  
  // 3. Update app_metadata to ensure JWT reflects it
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: { is_platform_admin: true }
  });
  
  if (updateError) {
    console.error("Failed to update app_metadata:", updateError);
    return;
  }
  
  console.log("Successfully added user to platform_admins!");
}

main().catch(console.error);
