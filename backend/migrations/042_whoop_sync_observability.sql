-- WHOOP sync observability: confirm Whoop's webhooks arrive (instant) vs. our
-- 5-minute backup pull catching recovery. Columns on an existing table → no
-- new GRANTs needed. Code writes these best-effort, so it's safe to deploy
-- before running this.
--
-- Run in the Supabase SQL editor.
ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS whoop_last_webhook_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whoop_last_webhook_type TEXT,
  -- How the most recent sync was triggered: 'webhook' | 'pull' (app backup
  -- check) | 'manual' (Sync now / Check again) | 'backfill' (on connect).
  ADD COLUMN IF NOT EXISTS whoop_last_sync_origin TEXT,
  -- When today's recovery was first stored, and by which path.
  ADD COLUMN IF NOT EXISTS whoop_recovery_landed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whoop_recovery_landed_via TEXT;
