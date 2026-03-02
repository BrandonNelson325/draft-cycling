-- Migration 014: Add push notification fields to athletes table

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS push_notifications_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS morning_checkin_time TIME DEFAULT '07:00:00',
  ADD COLUMN IF NOT EXISTS push_quiet_hours_start TIME DEFAULT '22:00:00',
  ADD COLUMN IF NOT EXISTS push_quiet_hours_end TIME DEFAULT '07:00:00';
