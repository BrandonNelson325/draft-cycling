-- Add updated_at to calendar_entries.
--
-- Three places in calendarService.ts write `updated_at` on update/complete:
--   - schedule (line 151)
--   - updateEntry (line 180)
--   - completeWorkout (line 228)
-- The column was never added to the table in 001_initial_schema.sql, so any
-- write to it 400'd with a PostgREST "column not found" error. The TS type
-- already declares it optional in backend/src/types/calendar.ts.

ALTER TABLE calendar_entries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
