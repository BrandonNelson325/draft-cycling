-- Migration: Add health/wellness data table
-- Description: Stores sleep, HRV, and other wellness metrics from manual input or Garmin

CREATE TABLE IF NOT EXISTS health_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Sleep metrics
  sleep_hours DECIMAL(4,2), -- Hours of sleep (e.g., 7.5)
  sleep_quality INTEGER CHECK (sleep_quality >= 1 AND sleep_quality <= 5), -- 1-5 rating
  sleep_score INTEGER CHECK (sleep_score >= 0 AND sleep_score <= 100), -- 0-100 from Garmin

  -- Heart metrics
  hrv INTEGER, -- Heart rate variability in ms
  resting_heart_rate INTEGER, -- Resting HR in bpm

  -- Recovery/readiness metrics
  body_battery INTEGER CHECK (body_battery >= 0 AND body_battery <= 100), -- Garmin Body Battery
  readiness_score INTEGER CHECK (readiness_score >= 0 AND readiness_score <= 100), -- Overall readiness
  stress_level INTEGER CHECK (stress_level >= 1 AND stress_level <= 5), -- 1-5 subjective stress

  -- Additional info
  notes TEXT, -- User notes about how they feel
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'garmin', 'whoop', 'oura', 'other')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one record per athlete per day
  UNIQUE(athlete_id, date)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_health_data_athlete_date ON health_data(athlete_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_health_data_recent ON health_data(athlete_id, created_at DESC);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_health_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER health_data_updated_at
  BEFORE UPDATE ON health_data
  FOR EACH ROW
  EXECUTE FUNCTION update_health_data_updated_at();

-- Add comment
COMMENT ON TABLE health_data IS 'Stores daily wellness metrics from manual input or device integrations (Garmin, Whoop, Oura, etc.)';
