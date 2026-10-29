-- Today's suggested adjustment ("Swap sprints for Z2 endurance"), stored on the
-- planned calendar entry so it survives a suggestion-cache clear / restart and
-- the AI can't re-roll it into the opposite call. Reused only while it matches
-- the entry's current workout_id and today's date (see utils/stickyAdjustment.ts).
ALTER TABLE calendar_entries
  ADD COLUMN IF NOT EXISTS suggested_adjustment JSONB;
