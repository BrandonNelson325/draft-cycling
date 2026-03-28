-- Add Wahoo integration columns to athletes table
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_user_id TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_access_token TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_refresh_token TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_token_expires_at TIMESTAMPTZ;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_auto_sync BOOLEAN DEFAULT FALSE;

-- Add 'wahoo' to workout_syncs integration check constraint
ALTER TABLE workout_syncs DROP CONSTRAINT IF EXISTS workout_syncs_integration_check;
ALTER TABLE workout_syncs ADD CONSTRAINT workout_syncs_integration_check
  CHECK (integration IN ('intervals_icu', 'garmin', 'trainingpeaks', 'wahoo'));
