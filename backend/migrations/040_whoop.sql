-- WHOOP integration.
--
-- Whoop is the athlete's RECOVERY source when connected (recovery, HRV, RHR,
-- sleep, strain); Draft keeps owning training decisions and uses this data as
-- an input. Columns are added to existing tables only (no new tables → no new
-- GRANTs needed).
--
-- Run in the Supabase SQL editor.

-- Tokens + connection state on the athlete.
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS whoop_user_id TEXT,
  ADD COLUMN IF NOT EXISTS whoop_access_token TEXT,
  ADD COLUMN IF NOT EXISTS whoop_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS whoop_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whoop_last_sync_at TIMESTAMPTZ,
  -- Whoop requires an 8-char OAuth `state`, so the athlete id can't ride in it.
  -- A one-time random state is stored here and matched on callback.
  ADD COLUMN IF NOT EXISTS whoop_oauth_state TEXT,
  ADD COLUMN IF NOT EXISTS whoop_oauth_mobile BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_athletes_whoop_user_id ON athletes(whoop_user_id);
CREATE INDEX IF NOT EXISTS idx_athletes_whoop_oauth_state ON athletes(whoop_oauth_state);

-- Whoop-specific daily wellness. Shared fields (hrv, rhr, sleep_seconds,
-- wellness_sleep_score, readiness_score) are reused: readiness_score = Whoop
-- recovery %, wellness_sleep_score = Whoop sleep performance %.
ALTER TABLE daily_metrics
  ADD COLUMN IF NOT EXISTS recovery_calibrating BOOLEAN,
  ADD COLUMN IF NOT EXISTS spo2 NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS skin_temp_c NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS respiratory_rate NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sleep_efficiency SMALLINT,
  ADD COLUMN IF NOT EXISTS sleep_consistency SMALLINT,
  ADD COLUMN IF NOT EXISTS sleep_need_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS sleep_debt_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS day_strain NUMERIC(5,2),
  -- Non-cycling sessions Whoop recorded that day (soccer, gym, run…):
  -- [{ sport, start, minutes, strain, avg_hr, max_hr }]. Rides are ignored —
  -- Strava already supplies them with power.
  ADD COLUMN IF NOT EXISTS other_activities JSONB;

-- Allow 'whoop' as a wellness source.
ALTER TABLE daily_metrics DROP CONSTRAINT IF EXISTS daily_metrics_wellness_source_check;
ALTER TABLE daily_metrics
  ADD CONSTRAINT daily_metrics_wellness_source_check
  CHECK (wellness_source IN ('whoop', 'intervals_icu', 'apple_health', 'manual'));
