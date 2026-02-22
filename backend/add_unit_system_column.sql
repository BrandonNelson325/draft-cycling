-- Add unit_system column to athletes table
ALTER TABLE athletes
ADD COLUMN IF NOT EXISTS unit_system TEXT CHECK (unit_system IN ('metric', 'imperial')) DEFAULT 'metric';

-- Add comment to column
COMMENT ON COLUMN athletes.unit_system IS 'Preferred unit system for displaying distances and weights';
