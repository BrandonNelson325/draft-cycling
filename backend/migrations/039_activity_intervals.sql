-- Migration 039: capture per-lap interval data + computed interval analysis
-- from Strava for structured-workout debriefs by the AI coach.
--
-- strava_activities is an EXISTING (already-granted) table, so adding columns
-- needs no new GRANTs. Both columns are nullable and backfilled lazily:
--   - laps: trimmed array of the ride's laps (Strava detail endpoint)
--   - interval_analysis: computed work/recovery rep breakdown + fade/consistency
-- A ride with no meaningful laps leaves both null (coach reports "no distinct
-- intervals found"); rides synced before this migration backfill on demand the
-- first time the coach analyzes them.

ALTER TABLE strava_activities
  ADD COLUMN IF NOT EXISTS laps jsonb,
  ADD COLUMN IF NOT EXISTS interval_analysis jsonb;
