-- Add integration columns for Intervals.icu and other services
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS intervals_icu_athlete_id TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS intervals_icu_access_token TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS intervals_icu_refresh_token TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS intervals_icu_token_expires_at TIMESTAMPTZ;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS intervals_icu_auto_sync BOOLEAN DEFAULT FALSE;

-- Add notification preferences
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT TRUE;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS sms_notifications BOOLEAN DEFAULT FALSE;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Add daily analysis preferences
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS daily_analysis_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS daily_analysis_time TIME DEFAULT '06:00:00';
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Los_Angeles';
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS auto_adjust_workouts BOOLEAN DEFAULT FALSE;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS last_daily_analysis_viewed TIMESTAMPTZ;

-- Create table to track synced workouts
CREATE TABLE IF NOT EXISTS workout_syncs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  calendar_entry_id UUID REFERENCES calendar_entries(id) ON DELETE CASCADE,

  -- Integration target
  integration TEXT NOT NULL CHECK (integration IN ('intervals_icu', 'garmin', 'trainingpeaks')),

  -- External IDs
  external_id TEXT, -- ID in the external system
  external_url TEXT, -- Link to workout in external system

  -- Sync status
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'deleted')),
  sync_error TEXT,
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workout_id, calendar_entry_id, integration)
);

CREATE INDEX IF NOT EXISTS idx_workout_syncs_workout ON workout_syncs(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_syncs_athlete ON workout_syncs(athlete_id);
CREATE INDEX IF NOT EXISTS idx_workout_syncs_integration ON workout_syncs(integration);
CREATE INDEX IF NOT EXISTS idx_workout_syncs_status ON workout_syncs(sync_status);

-- Enable RLS
ALTER TABLE workout_syncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout syncs"
  ON workout_syncs FOR SELECT
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can create own workout syncs"
  ON workout_syncs FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "Users can update own workout syncs"
  ON workout_syncs FOR UPDATE
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can delete own workout syncs"
  ON workout_syncs FOR DELETE
  USING (auth.uid() = athlete_id);

COMMENT ON TABLE workout_syncs IS 'Tracks workout syncs to external platforms (Intervals.icu, Garmin, TrainingPeaks)';
