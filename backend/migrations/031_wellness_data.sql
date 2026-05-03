-- Wellness data from intervals.icu (and future direct integrations).
--
-- Stored on daily_metrics so a single row per (athlete, date) holds both the
-- subjective check-in (sleep_quality, feeling, notes) AND objective wellness
-- pulled from the device. Either or both may be present:
--   - manual only:    user filled out the morning modal, no device connection
--   - wellness only:  device data pulled, user hasn't done check-in yet today
--   - both:           device data + user picked a 5-level overall feeling
--
-- The `wellness_source` column lets us distinguish where objective data came
-- from when we add direct Garmin/Whoop/HealthKit integrations later.

ALTER TABLE daily_metrics
  ADD COLUMN IF NOT EXISTS hrv SMALLINT,
  ADD COLUMN IF NOT EXISTS rhr SMALLINT,
  ADD COLUMN IF NOT EXISTS sleep_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS sleep_score SMALLINT,
  ADD COLUMN IF NOT EXISTS readiness_score SMALLINT,
  ADD COLUMN IF NOT EXISTS wellness_source TEXT
    CHECK (wellness_source IN ('intervals_icu', 'manual')),
  ADD COLUMN IF NOT EXISTS wellness_synced_at TIMESTAMPTZ;

-- Per-athlete toggle to enable pulling wellness from intervals.icu.
-- Off by default — opt-in via Settings → intervals.icu connection area.
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS intervals_icu_use_wellness BOOLEAN NOT NULL DEFAULT FALSE;
