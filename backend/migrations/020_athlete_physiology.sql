-- Add physiology fields to athletes for better training calculations
-- max_hr: used for HR-based TSS, HR zone calculations
-- resting_hr: recovery tracking, aerobic fitness indicator
-- date_of_birth: age-based max HR estimation (220 - age), recovery context
-- heart_rate_zones: custom HR zones (optional, auto-calculated if max_hr set)

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS max_hr INTEGER,
  ADD COLUMN IF NOT EXISTS resting_hr INTEGER,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;
