-- Make post-ride FTP recalculation observable. autoUpdateFTP runs after every
-- uploaded ride but only COMMITS a new ftp when it's a confident, >5W improvement,
-- so from the outside it's impossible to tell the recalc actually ran. These
-- columns record the outcome of every recalc (the estimate + when it ran + why it
-- did/didn't commit), so "is FTP recalculating after each ride?" is answerable by
-- looking at ftp_estimated_at advancing — even when the committed ftp doesn't move.

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS ftp_estimate       INTEGER;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS ftp_estimate_conf  TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS ftp_estimate_reason TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS ftp_estimated_at   TIMESTAMPTZ;
