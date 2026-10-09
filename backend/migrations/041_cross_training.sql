-- Cross-training: every non-cycling Strava activity (runs, swims, gym, hikes,
-- soccer, kayaking…), rated for how it affects CYCLING training.
--
-- Kept OUT of strava_activities on purpose: ~20 code paths treat every row
-- there as a ride (power curves, weekly volume, post-ride prompts, ride
-- notifications). Only the load model and the coach read this table.
--
-- Each activity gets:
--   est_tss       systemic load (HR-based when HR exists, else duration × sport intensity)
--   fitness_load  est_tss × how much it builds CYCLING fitness   → feeds CTL
--   fatigue_load  est_tss × how hard it hits cycling legs         → feeds ATL
--
-- Run in the Supabase SQL editor. NEW TABLE → explicit GRANTs (Supabase Data
-- API no longer auto-exposes new public tables).

CREATE TABLE IF NOT EXISTS public.cross_training_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  strava_activity_id BIGINT NOT NULL UNIQUE,
  name TEXT,
  sport_type TEXT NOT NULL,        -- Strava's sport_type, e.g. 'Run', 'WeightTraining'
  category TEXT NOT NULL,          -- our grouping, e.g. 'run', 'strength', 'paddle'
  start_date TIMESTAMPTZ NOT NULL,
  moving_time_seconds INTEGER,
  distance_meters INTEGER,
  total_elevation_gain NUMERIC(8,1),
  average_heartrate NUMERIC(5,1),
  max_heartrate NUMERIC(5,1),
  est_tss NUMERIC(6,1),
  fitness_load NUMERIC(6,1),
  fatigue_load NUMERIC(6,1),
  load_method TEXT CHECK (load_method IN ('hr', 'duration')),
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cross_training_athlete_date
  ON public.cross_training_activities(athlete_id, start_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_training_activities TO service_role;
GRANT SELECT ON public.cross_training_activities TO authenticated;

ALTER TABLE public.cross_training_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own cross training" ON public.cross_training_activities;
CREATE POLICY "Users can view own cross training"
  ON public.cross_training_activities FOR SELECT
  USING (auth.uid() = athlete_id);

-- Rides without a power meter used to get NO load at all (tss stayed null).
-- They now get an HR-based estimate; record where each ride's TSS came from.
ALTER TABLE strava_activities
  ADD COLUMN IF NOT EXISTS tss_source TEXT CHECK (tss_source IN ('power', 'hr', 'duration'));

-- One-time backfill marker (last ~120 days of non-cycling activities + HR load
-- for old rides that had no power). NULL = not done yet.
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS cross_training_backfilled_at TIMESTAMPTZ;
