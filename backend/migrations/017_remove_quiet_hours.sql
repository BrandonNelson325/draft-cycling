ALTER TABLE athletes
  DROP COLUMN IF EXISTS push_quiet_hours_start,
  DROP COLUMN IF EXISTS push_quiet_hours_end;
