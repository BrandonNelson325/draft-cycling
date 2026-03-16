-- Add experience level and weekly training hours as first-class athlete fields
-- These are critical for proper workout prescription by the AI coach

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  ADD COLUMN IF NOT EXISTS weekly_training_hours NUMERIC(4,1);

COMMENT ON COLUMN athletes.experience_level IS 'Cycling experience: beginner (0-2 years), intermediate (2-5 years), advanced (5+ years)';
COMMENT ON COLUMN athletes.weekly_training_hours IS 'Target weekly training hours the athlete commits to';
