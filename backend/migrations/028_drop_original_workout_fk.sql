-- Drop the FK constraint added in 027 from calendar_entries.original_workout_id.
--
-- Why: PostgREST (Supabase's REST layer) embeds related tables based on FK relationships.
-- After 027 added `original_workout_id REFERENCES workouts(id)`, calendar_entries had TWO
-- FKs to workouts (workout_id + original_workout_id). PostgREST then refuses queries like
-- `select('*, workouts(*)')` because the relationship is ambiguous — every calendar fetch
-- in the app started 500'ing.
--
-- The column stays as a plain UUID. Loss: no automatic SET NULL on workout deletion. We
-- treat the snapshot as best-effort — a null check on read is sufficient since this is
-- only used for "originally planned" display.

ALTER TABLE calendar_entries
  DROP CONSTRAINT IF EXISTS calendar_entries_original_workout_id_fkey;
