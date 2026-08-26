-- Notification preferences + phone number for SMS dispatch.
-- Safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone              TEXT;

-- Per-user channel preferences. Stored as JSONB so it's flexible:
--   { "in_app": true, "email": true, "sms": false }
-- Default = all on except SMS (SMS costs money).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB
    NOT NULL DEFAULT '{"in_app": true, "email": true, "sms": false}'::jsonb;
