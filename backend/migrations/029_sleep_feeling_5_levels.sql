-- Expand sleep_quality and feeling check-in scales from 3 levels to 5,
-- to match the 5-level RPE feedback used post-ride.
--
-- Old → new value sets:
--   sleep_quality: poor / good / great → terrible / poor / okay / good / great
--   feeling: tired / normal / energized → exhausted / tired / normal / good / energized
--
-- Existing rows are unaffected — old values stay valid in the new constraint.

ALTER TABLE daily_metrics DROP CONSTRAINT IF EXISTS daily_metrics_sleep_quality_check;
ALTER TABLE daily_metrics
  ADD CONSTRAINT daily_metrics_sleep_quality_check
  CHECK (sleep_quality IN ('terrible', 'poor', 'okay', 'good', 'great'));

ALTER TABLE daily_metrics DROP CONSTRAINT IF EXISTS daily_metrics_feeling_check;
ALTER TABLE daily_metrics
  ADD CONSTRAINT daily_metrics_feeling_check
  CHECK (feeling IN ('exhausted', 'tired', 'normal', 'good', 'energized'));
