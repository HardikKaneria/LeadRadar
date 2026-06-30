-- Run this script to elevate all current users to platform_admins in your local DB
-- You can run this using: pnpm supabase db psql -f supabase/seed_platform_admin.sql

INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
