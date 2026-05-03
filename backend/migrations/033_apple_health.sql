-- Apple Health (HealthKit) integration. iOS-only — the mobile app reads from
-- HealthKit on-device and POSTs to the backend, since HealthKit doesn't expose
-- a server-to-server pull (unlike intervals.icu).
--
-- Two flags on athletes:
--   apple_health_enabled       — has the user granted permission + opted in?
--   apple_health_last_sync_at  — last successful push from the mobile app
--
-- Expand the wellness_source CHECK on daily_metrics to allow 'apple_health'.

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS apple_health_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS apple_health_last_sync_at TIMESTAMPTZ;

ALTER TABLE daily_metrics DROP CONSTRAINT IF EXISTS daily_metrics_wellness_source_check;
ALTER TABLE daily_metrics
  ADD CONSTRAINT daily_metrics_wellness_source_check
  CHECK (wellness_source IN ('intervals_icu', 'apple_health', 'manual'));
