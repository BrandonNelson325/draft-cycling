-- Add wellness_sleep_score (0-100 from intervals.icu) so it doesn't collide
-- with the existing daily_metrics.sleep_score column (1-10 from manual check-in,
-- defined in migration 018).
--
-- The two scores have different scales and meanings; keeping them separate
-- avoids breaking readiness logic that reads the manual score.

ALTER TABLE daily_metrics
  ADD COLUMN IF NOT EXISTS wellness_sleep_score SMALLINT;
