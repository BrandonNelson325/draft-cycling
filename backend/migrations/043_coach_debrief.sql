-- Coach-initiated ride debriefs: when the athlete leaves post-ride notes, or a
-- scheduled FTP test is read, the coach messages them first. This marks the
-- ride as debriefed so it happens at most once per ride (claimed atomically).
ALTER TABLE strava_activities ADD COLUMN IF NOT EXISTS coach_debrief_at TIMESTAMPTZ;
