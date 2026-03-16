-- Notification tracking to prevent duplicate sends and enable reminders
-- Morning check-in: send once at configured time, reminder 4h later if not completed
-- Activity feedback: send once when synced, reminder 4h later if not acknowledged

-- Track morning notification sends on athletes table
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS morning_notif_sent_date DATE,
  ADD COLUMN IF NOT EXISTS morning_reminder_sent_date DATE;

-- Track activity notification sends on strava_activities table
ALTER TABLE strava_activities
  ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Index for finding activities needing reminders
CREATE INDEX IF NOT EXISTS idx_strava_activities_notification_reminder
  ON strava_activities(athlete_id, notification_sent_at, reminder_sent_at, acknowledged_at)
  WHERE notification_sent_at IS NOT NULL AND reminder_sent_at IS NULL AND acknowledged_at IS NULL;
