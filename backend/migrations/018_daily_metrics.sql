-- Daily Metrics Table
-- Tracks daily check-ins: sleep quality, feeling, and coaching conversations

CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Sleep tracking
  sleep_quality TEXT CHECK (sleep_quality IN ('poor', 'good', 'great')),
  sleep_score INTEGER, -- 1-10 scale (poor=3, good=7, great=10)

  -- Feeling/readiness
  feeling TEXT CHECK (feeling IN ('tired', 'normal', 'energized')),
  feeling_score INTEGER, -- 1-10 scale (tired=3, normal=7, energized=10)

  -- Notes from check-in
  notes TEXT,

  -- Check-in status
  check_in_completed BOOLEAN DEFAULT FALSE,
  check_in_at TIMESTAMP WITH TIME ZONE,

  -- Training readiness (calculated)
  training_load_last_7_days INTEGER, -- Total TSS from last 7 days
  acute_load INTEGER, -- Last 7 days average
  chronic_load INTEGER, -- Last 42 days average

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure one entry per athlete per day
  UNIQUE(athlete_id, date)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_daily_metrics_athlete_date ON daily_metrics(athlete_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_check_in ON daily_metrics(athlete_id, check_in_completed, date DESC);

-- RLS Policies
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own daily metrics"
  ON daily_metrics FOR SELECT
  USING (athlete_id = auth.uid());

CREATE POLICY "Users can insert their own daily metrics"
  ON daily_metrics FOR INSERT
  WITH CHECK (athlete_id = auth.uid());

CREATE POLICY "Users can update their own daily metrics"
  ON daily_metrics FOR UPDATE
  USING (athlete_id = auth.uid());

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_daily_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_metrics_updated_at
  BEFORE UPDATE ON daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_metrics_updated_at();

COMMENT ON TABLE daily_metrics IS 'Daily athlete check-ins including sleep, feeling, and training readiness';
COMMENT ON COLUMN daily_metrics.sleep_quality IS 'Subjective sleep quality: poor/good/great';
COMMENT ON COLUMN daily_metrics.sleep_score IS 'Numeric sleep score 1-10 (poor=3, good=7, great=10)';
COMMENT ON COLUMN daily_metrics.feeling IS 'How athlete feels: tired/normal/energized';
COMMENT ON COLUMN daily_metrics.feeling_score IS 'Numeric feeling score 1-10';
