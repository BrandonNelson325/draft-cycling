-- Add entry_type to calendar_entries to distinguish workouts from rest days
ALTER TABLE calendar_entries ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'workout'
  CHECK (entry_type IN ('workout', 'rest'));
