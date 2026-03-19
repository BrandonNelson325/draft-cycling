-- Add FTP Builder training plan template
INSERT INTO training_plan_templates (name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, phases, tags, sort_order) VALUES
('FTP Builder', 'ftp-builder',
 'Progressive plan focused on raising your functional threshold power through sweet spot and threshold work. Builds aerobic base first, then layers in progressively harder FTP-specific intervals.',
 'General Fitness',
 'intermediate',
 8, 4, 6.0, 9.0,
 '[
   {
     "phase": "base",
     "weeks": [1, 2],
     "description": "Aerobic foundation with sweet spot introduction",
     "weekly_structure": [
       {"day": "tuesday", "type": "sweet_spot", "duration_minutes": 60, "difficulty": "moderate", "description": "Sweet Spot 2x15"},
       {"day": "thursday", "type": "endurance", "duration_minutes": 60, "difficulty": "easy", "description": "Endurance ride with cadence drills"},
       {"day": "saturday", "type": "endurance", "duration_minutes": 90, "difficulty": "moderate", "description": "Long Z2 endurance ride"},
       {"day": "sunday", "type": "recovery", "duration_minutes": 45, "difficulty": "easy", "description": "Easy recovery spin"}
     ]
   },
   {
     "phase": "build",
     "weeks": [3, 4, 5, 6],
     "description": "Progressive threshold and sweet spot intervals",
     "weekly_structure": [
       {"day": "tuesday", "type": "threshold", "duration_minutes": 60, "difficulty": "hard", "description": "Threshold intervals 3x10 progressing to 3x15"},
       {"day": "thursday", "type": "sweet_spot", "duration_minutes": 60, "difficulty": "moderate", "description": "Sweet spot 2x20 progressing to 1x40"},
       {"day": "saturday", "type": "endurance", "duration_minutes": 105, "difficulty": "moderate", "description": "Long endurance ride with tempo blocks"},
       {"day": "sunday", "type": "recovery", "duration_minutes": 45, "difficulty": "easy", "description": "Easy recovery spin"}
     ]
   },
   {
     "phase": "peak",
     "weeks": [7, 8],
     "description": "FTP-specific peak work with over-under intervals",
     "weekly_structure": [
       {"day": "tuesday", "type": "threshold", "duration_minutes": 60, "difficulty": "very_hard", "description": "Over-under intervals 3x12"},
       {"day": "thursday", "type": "threshold", "duration_minutes": 60, "difficulty": "hard", "description": "Sustained threshold 2x20"},
       {"day": "saturday", "type": "endurance", "duration_minutes": 90, "difficulty": "moderate", "description": "Endurance ride with threshold surges"},
       {"day": "sunday", "type": "recovery", "duration_minutes": 45, "difficulty": "easy", "description": "Easy recovery spin"}
     ]
   }
 ]'::jsonb,
 ARRAY['ftp', 'threshold', 'sweet-spot', 'power'],
 9
);
