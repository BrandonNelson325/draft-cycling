-- Prefix all existing workout names with "Draft - " (skip any already prefixed)
UPDATE workouts
SET name = 'Draft - ' || name
WHERE name NOT LIKE 'Draft - %';
