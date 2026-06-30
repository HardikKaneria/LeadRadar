-- Add weekly insight preference
ALTER TABLE public.notification_preferences 
ADD COLUMN IF NOT EXISTS notify_weekly_insight boolean NOT NULL DEFAULT true;
