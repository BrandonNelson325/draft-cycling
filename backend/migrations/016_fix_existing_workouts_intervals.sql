-- Fix existing workouts that have intervals with "repeat" on work intervals
-- without interleaved rest. These were created from templates before the
-- template fix (migration 015). The repeat field causes N consecutive work
-- intervals with no recovery in the visualization and exported files.
--
-- Pattern to fix: {..., {type:"work", repeat:N, ...}, {type:"rest", ...}, ...}
-- Becomes: {..., work, rest, work, rest, ...(N-1 pairs)..., work, ...}
-- (Last rep has no trailing rest before cooldown, matching template fix pattern)

DO $$
DECLARE
  workout_row RECORD;
  old_intervals jsonb;
  new_intervals jsonb;
  i int;
  curr jsonb;
  next_interval jsonb;
  repeat_count int;
  j int;
  arr_len int;
  work_without_repeat jsonb;
BEGIN
  -- Find all workouts that have any interval with repeat > 1
  FOR workout_row IN
    SELECT w.id, w.intervals
    FROM workouts w
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_array_elements(w.intervals) elem
      WHERE (elem->>'repeat')::int > 1
    )
  LOOP
    old_intervals := workout_row.intervals;
    new_intervals := '[]'::jsonb;
    arr_len := jsonb_array_length(old_intervals);
    i := 0;

    WHILE i < arr_len LOOP
      curr := old_intervals->i;
      repeat_count := COALESCE((curr->>'repeat')::int, 1);

      IF repeat_count > 1 AND curr->>'type' = 'work' THEN
        -- Build the work interval without the repeat field
        work_without_repeat := curr - 'repeat';

        -- Check if next interval is a rest
        IF i + 1 < arr_len AND (old_intervals->(i+1))->>'type' = 'rest' THEN
          next_interval := old_intervals->(i+1);

          -- Interleave: work, rest, work, rest, ... work (no trailing rest)
          FOR j IN 1..repeat_count LOOP
            new_intervals := new_intervals || jsonb_build_array(work_without_repeat);
            IF j < repeat_count THEN
              new_intervals := new_intervals || jsonb_build_array(next_interval);
            END IF;
          END LOOP;

          -- Skip the rest interval since we already consumed it
          i := i + 2;
        ELSE
          -- No rest follows; just unroll work intervals back to back
          FOR j IN 1..repeat_count LOOP
            new_intervals := new_intervals || jsonb_build_array(work_without_repeat);
          END LOOP;
          i := i + 1;
        END IF;
      ELSE
        -- Non-repeated interval or non-work: pass through as-is (strip repeat if 1)
        IF repeat_count = 1 THEN
          new_intervals := new_intervals || jsonb_build_array(curr - 'repeat');
        ELSE
          new_intervals := new_intervals || jsonb_build_array(curr);
        END IF;
        i := i + 1;
      END IF;
    END LOOP;

    -- Update the workout
    UPDATE workouts
    SET intervals = new_intervals
    WHERE id = workout_row.id;

    RAISE NOTICE 'Fixed workout %: % intervals -> % intervals',
      workout_row.id,
      jsonb_array_length(old_intervals),
      jsonb_array_length(new_intervals);
  END LOOP;
END $$;
