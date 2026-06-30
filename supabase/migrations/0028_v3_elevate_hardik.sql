INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'hardik@hkrafted.com'
ON CONFLICT (user_id) DO NOTHING;
