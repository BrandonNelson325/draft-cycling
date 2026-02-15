-- Add beta access code field to athletes table

ALTER TABLE athletes ADD COLUMN beta_access_code TEXT;
ALTER TABLE athletes ADD COLUMN beta_access_activated_at TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX idx_athletes_beta_code ON athletes(beta_access_code) WHERE beta_access_code IS NOT NULL;

-- Update RLS policies to allow beta access
-- (The middleware will handle the logic, no RLS changes needed)
