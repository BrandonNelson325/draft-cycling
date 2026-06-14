-- Migration 036: allow 'sweet_spot' and 'anaerobic' workout types.
--
-- The AI plan designer prescribes sweet-spot and anaerobic sessions (real,
-- valuable training zones), but the original CHECK constraints (migrations 001
-- and 010) only permitted endurance/tempo/threshold/vo2max/sprint/recovery/
-- custom. Inserting a sweet_spot/anaerobic workout violated
-- workouts_workout_type_check and FAILED the entire plan build.
--
-- This widens the allowed set on both `workouts` and `workout_templates`.
-- Additive and safe to run on the live DB — it only permits more values, so
-- existing rows and code keep working. RUN THIS BEFORE relying on the new types.
-- No GRANTs needed (existing tables retain their grants).

ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_workout_type_check;
ALTER TABLE workouts ADD CONSTRAINT workouts_workout_type_check
  CHECK (workout_type IN (
    'endurance', 'tempo', 'threshold', 'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'recovery', 'custom'
  ));

ALTER TABLE workout_templates DROP CONSTRAINT IF EXISTS workout_templates_workout_type_check;
ALTER TABLE workout_templates ADD CONSTRAINT workout_templates_workout_type_check
  CHECK (workout_type IN (
    'endurance', 'tempo', 'threshold', 'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'recovery', 'custom'
  ));
