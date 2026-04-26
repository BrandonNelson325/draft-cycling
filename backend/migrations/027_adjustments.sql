-- AI-suggested adjustments to planned workouts
--
-- Adds snapshot columns to calendar_entries so an accepted "rest day"/"easier"/"swap"
-- adjustment can mutate the calendar while preserving the original plan for display + undo.
-- Adds adjustment_dismissals so a user can dismiss today's suggestion and not see it again
-- until cache invalidates (new ride synced, calendar edit, etc.).

-- 1. Snapshot of the original plan, populated only when an adjustment is accepted.
ALTER TABLE calendar_entries
  ADD COLUMN IF NOT EXISTS original_workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_entry_type TEXT CHECK (original_entry_type IN ('workout', 'rest')),
  ADD COLUMN IF NOT EXISTS adjusted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adjustment_kind TEXT CHECK (adjustment_kind IN ('rest', 'easier', 'swap')),
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

-- 2. Per-day dismissals of the AI's suggested adjustment.
CREATE TABLE IF NOT EXISTS adjustment_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  dismissed_date DATE NOT NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(athlete_id, dismissed_date)
);

CREATE INDEX IF NOT EXISTS idx_adjustment_dismissals_athlete_date
  ON adjustment_dismissals(athlete_id, dismissed_date DESC);

ALTER TABLE adjustment_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own adjustment dismissals"
  ON adjustment_dismissals FOR SELECT
  USING (athlete_id = auth.uid());

CREATE POLICY "Users can insert their own adjustment dismissals"
  ON adjustment_dismissals FOR INSERT
  WITH CHECK (athlete_id = auth.uid());

CREATE POLICY "Users can delete their own adjustment dismissals"
  ON adjustment_dismissals FOR DELETE
  USING (athlete_id = auth.uid());
