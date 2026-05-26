-- Separate the "Apple Health is connected" flag from the "use Apple Health as
-- the wellness source for morning check-in" flag.
--
-- Some athletes want to read HealthKit data for context/metrics/future features
-- but still answer the subjective morning sleep + feel questions themselves.
-- Mirrors the intervals.icu pattern: `intervals_icu_auto_sync` (connection)
-- vs `intervals_icu_use_wellness` (replaces sleep picker).

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS apple_health_use_for_wellness BOOLEAN NOT NULL DEFAULT FALSE;
