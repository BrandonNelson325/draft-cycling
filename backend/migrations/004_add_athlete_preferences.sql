-- Add preferences column to athletes table for AI learning
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Create index for faster JSONB queries
CREATE INDEX IF NOT EXISTS idx_athletes_preferences ON athletes USING GIN (preferences);

-- Example preferences structure:
-- {
--   "workout_duration_preference": "60-90min",
--   "preferred_workout_types": ["threshold", "tempo"],
--   "rest_days": ["Sunday"],
--   "training_goal": "Improve FTP for upcoming race",
--   "event_date": "2026-06-15",
--   "weekly_hours": 8,
--   "time_constraints": "Limited on weekdays, more time on weekends",
--   "indoor_outdoor": "both",
--   "zwift_available": true,
--   "intensity_preference": "prefers-hard-efforts",
--   "learned_patterns": {
--     "typical_workout_duration": 75,
--     "favorite_interval_type": "4x8min",
--     "recovery_preference": "active"
--   }
-- }

COMMENT ON COLUMN athletes.preferences IS 'AI-learned preferences and training goals stored as JSONB';
