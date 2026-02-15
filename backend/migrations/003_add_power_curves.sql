-- Add power curve table for storing best efforts

CREATE TABLE power_curves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  strava_activity_id BIGINT NOT NULL REFERENCES strava_activities(strava_activity_id) ON DELETE CASCADE,

  -- Best power efforts (watts) for various durations
  power_1min INTEGER,
  power_3min INTEGER,
  power_5min INTEGER,
  power_8min INTEGER,
  power_10min INTEGER,
  power_15min INTEGER,
  power_20min INTEGER,
  power_30min INTEGER,
  power_45min INTEGER,
  power_60min INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(athlete_id, strava_activity_id)
);

-- Index for faster lookups
CREATE INDEX idx_power_curves_athlete_id ON power_curves(athlete_id);
CREATE INDEX idx_power_curves_created_at ON power_curves(created_at);

-- Enable RLS
ALTER TABLE power_curves ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can view own power curves"
  ON power_curves FOR SELECT
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can insert own power curves"
  ON power_curves FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "Users can update own power curves"
  ON power_curves FOR UPDATE
  USING (auth.uid() = athlete_id);
