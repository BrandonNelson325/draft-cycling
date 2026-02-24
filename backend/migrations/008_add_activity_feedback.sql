-- Track post-ride acknowledgement and feedback on activities
ALTER TABLE strava_activities
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS perceived_effort INTEGER CHECK (perceived_effort BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS post_activity_notes TEXT;

-- Display mode preference on athlete profile
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS display_mode TEXT DEFAULT 'advanced'
    CHECK (display_mode IN ('simple', 'advanced'));
