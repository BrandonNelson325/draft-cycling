-- Track the short-duration power columns that were added directly in Supabase
-- but never captured in a migration. powerAnalysisService writes these on every
-- upsert; a fresh environment without them would fail every power_curves insert
-- (PGRST204), silently starving FTP estimation. Idempotent so it's a no-op in
-- environments where they already exist (e.g. production).

ALTER TABLE power_curves ADD COLUMN IF NOT EXISTS power_5sec  INTEGER;
ALTER TABLE power_curves ADD COLUMN IF NOT EXISTS power_15sec INTEGER;
ALTER TABLE power_curves ADD COLUMN IF NOT EXISTS power_30sec INTEGER;
