-- Fix all workout templates that use "repeat" on work intervals without rest
-- between reps. The repeat field causes N consecutive work intervals with no
-- recovery, making them impossible to execute as intended.
-- Also adds missing VO2max micro-interval formats.

-- ═══════════════════════════════════════════════════════════════════
-- FIX: VO2max workouts (unroll repeat → work/rest pairs)
-- ═══════════════════════════════════════════════════════════════════

-- VO2max 5x3: 5 × 3min @ 113% / 3min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":180,"power":113,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'VO2max 5x3';

-- VO2max 4x4: 4 × 4min @ 113% / 4min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":240,"power":113,"type":"work"},{"duration":240,"power":55,"type":"rest"},
  {"duration":240,"power":113,"type":"work"},{"duration":240,"power":55,"type":"rest"},
  {"duration":240,"power":113,"type":"work"},{"duration":240,"power":55,"type":"rest"},
  {"duration":240,"power":113,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'VO2max 4x4';

-- VO2max 6x3: 6 × 3min @ 113% / 3min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":180,"power":113,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'VO2max 6x3';

-- Short VO2max 8x2: 8 × 2min @ 116% / 2min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":120,"power":116,"type":"work"},{"duration":120,"power":55,"type":"rest"},
  {"duration":120,"power":116,"type":"work"},{"duration":120,"power":55,"type":"rest"},
  {"duration":120,"power":116,"type":"work"},{"duration":120,"power":55,"type":"rest"},
  {"duration":120,"power":116,"type":"work"},{"duration":120,"power":55,"type":"rest"},
  {"duration":120,"power":116,"type":"work"},{"duration":120,"power":55,"type":"rest"},
  {"duration":120,"power":116,"type":"work"},{"duration":120,"power":55,"type":"rest"},
  {"duration":120,"power":116,"type":"work"},{"duration":120,"power":55,"type":"rest"},
  {"duration":120,"power":116,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Short VO2max 8x2';

-- VO2max 3x5: 3 × 5min @ 110% / 5min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":300,"power":110,"type":"work"},{"duration":300,"power":55,"type":"rest"},
  {"duration":300,"power":110,"type":"work"},{"duration":300,"power":55,"type":"rest"},
  {"duration":300,"power":110,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'VO2max 3x5';

-- VO2max 10x1: 10 × 1min @ 118% / 1min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":60,"power":118,"type":"work"},{"duration":60,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":60,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":60,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":60,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":60,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":60,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":60,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":60,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":60,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'VO2max 10x1';

-- 40-20 VO2max Intervals: 2 sets of 8 × (40s @ 125% / 20s @ 55%), 4min between sets
UPDATE workout_templates SET description = '2 sets of 8 × 40s on / 20s off at 125% FTP. Spends maximum time near VO2max.', intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":240,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},{"duration":20,"power":55,"type":"rest"},
  {"duration":40,"power":125,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = '40-20 VO2max Intervals';

-- ═══════════════════════════════════════════════════════════════════
-- FIX: Threshold / Sweet Spot workouts
-- ═══════════════════════════════════════════════════════════════════

-- FTP 5x8: 5 × 8min @ 100% / 4min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":480,"power":100,"type":"work"},{"duration":240,"power":55,"type":"rest"},
  {"duration":480,"power":100,"type":"work"},{"duration":240,"power":55,"type":"rest"},
  {"duration":480,"power":100,"type":"work"},{"duration":240,"power":55,"type":"rest"},
  {"duration":480,"power":100,"type":"work"},{"duration":240,"power":55,"type":"rest"},
  {"duration":480,"power":100,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'FTP 5x8';

-- Threshold Cruise 4x10: 4 × 10min @ 100% / 2min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":600,"power":100,"type":"work"},{"duration":120,"power":55,"type":"rest"},
  {"duration":600,"power":100,"type":"work"},{"duration":120,"power":55,"type":"rest"},
  {"duration":600,"power":100,"type":"work"},{"duration":120,"power":55,"type":"rest"},
  {"duration":600,"power":100,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Threshold Cruise 4x10';

-- Sweet Spot 4x12: 4 × 12min @ 90% / 3min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":720,"power":90,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":720,"power":90,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":720,"power":90,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":720,"power":90,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Sweet Spot 4x12';

-- Tempo Cruise Intervals: 4 × 10min @ 83% / 3min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":600,"power":83,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":600,"power":83,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":600,"power":83,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":600,"power":83,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Tempo Cruise Intervals';

-- ═══════════════════════════════════════════════════════════════════
-- FIX: Sprint / Anaerobic workouts
-- ═══════════════════════════════════════════════════════════════════

-- Sprint Power Development: 8 × 10s @ 160% / 5min50s rest (6min cycle)
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":10,"power":160,"type":"work"},{"duration":350,"power":50,"type":"rest"},
  {"duration":10,"power":160,"type":"work"},{"duration":350,"power":50,"type":"rest"},
  {"duration":10,"power":160,"type":"work"},{"duration":350,"power":50,"type":"rest"},
  {"duration":10,"power":160,"type":"work"},{"duration":350,"power":50,"type":"rest"},
  {"duration":10,"power":160,"type":"work"},{"duration":350,"power":50,"type":"rest"},
  {"duration":10,"power":160,"type":"work"},{"duration":350,"power":50,"type":"rest"},
  {"duration":10,"power":160,"type":"work"},{"duration":350,"power":50,"type":"rest"},
  {"duration":10,"power":160,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Sprint Power Development';

-- 30-Second Power Sprints: 8 × 30s @ 150% / 4min30s rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":30,"power":150,"type":"work"},{"duration":270,"power":50,"type":"rest"},
  {"duration":30,"power":150,"type":"work"},{"duration":270,"power":50,"type":"rest"},
  {"duration":30,"power":150,"type":"work"},{"duration":270,"power":50,"type":"rest"},
  {"duration":30,"power":150,"type":"work"},{"duration":270,"power":50,"type":"rest"},
  {"duration":30,"power":150,"type":"work"},{"duration":270,"power":50,"type":"rest"},
  {"duration":30,"power":150,"type":"work"},{"duration":270,"power":50,"type":"rest"},
  {"duration":30,"power":150,"type":"work"},{"duration":270,"power":50,"type":"rest"},
  {"duration":30,"power":150,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = '30-Second Power Sprints';

-- Micro-Intervals 30/30: 20 × 30s @ 130% / 30s rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":130,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Micro-Intervals 30/30';

-- Tabata Sprints: 8 × 20s @ 170% / 10s rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":20,"power":170,"type":"work"},{"duration":10,"power":50,"type":"rest"},
  {"duration":20,"power":170,"type":"work"},{"duration":10,"power":50,"type":"rest"},
  {"duration":20,"power":170,"type":"work"},{"duration":10,"power":50,"type":"rest"},
  {"duration":20,"power":170,"type":"work"},{"duration":10,"power":50,"type":"rest"},
  {"duration":20,"power":170,"type":"work"},{"duration":10,"power":50,"type":"rest"},
  {"duration":20,"power":170,"type":"work"},{"duration":10,"power":50,"type":"rest"},
  {"duration":20,"power":170,"type":"work"},{"duration":10,"power":50,"type":"rest"},
  {"duration":20,"power":170,"type":"work"},
  {"duration":600,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Tabata Sprints';

-- Criterium Power Workout: Set 1: 12 × 45s @ 130% / 75s rest, 10min easy, Set 2: 8 × 45s @ 130% / 75s rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},
  {"duration":600,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},{"duration":75,"power":65,"type":"rest"},
  {"duration":45,"power":130,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Criterium Power Workout';

-- ═══════════════════════════════════════════════════════════════════
-- FIX: Taper / Pre-Race workouts
-- ═══════════════════════════════════════════════════════════════════

-- Taper Week Quality: 5 × 1min @ 118% / 3min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":60,"power":118,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":60,"power":118,"type":"work"},
  {"duration":600,"power":65,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Taper Week Quality';

-- Pre-Race Activation: 3 × 1min @ 105% / 3min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":600,"power":75,"type":"work"},
  {"duration":60,"power":105,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":60,"power":105,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":60,"power":105,"type":"work"},
  {"duration":600,"power":70,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Pre-Race Activation';

-- Race Day Opener: 3 × 10s @ 130% / 110s rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":60,"type":"warmup"},
  {"duration":10,"power":130,"type":"work"},{"duration":110,"power":55,"type":"rest"},
  {"duration":10,"power":130,"type":"work"},{"duration":110,"power":55,"type":"rest"},
  {"duration":10,"power":130,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Race Day Opener';

-- ═══════════════════════════════════════════════════════════════════
-- FIX: Beginner workouts
-- ═══════════════════════════════════════════════════════════════════

-- Intro to Intervals 6x5: 6 × 5min @ 85% / 3min rest
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":60,"type":"warmup"},
  {"duration":300,"power":85,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":300,"power":85,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":300,"power":85,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":300,"power":85,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":300,"power":85,"type":"work"},{"duration":180,"power":55,"type":"rest"},
  {"duration":300,"power":85,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Intro to Intervals — 6x5';

-- ═══════════════════════════════════════════════════════════════════
-- FIX: Endurance workouts with broken repeats
-- ═══════════════════════════════════════════════════════════════════

-- Endurance with Accelerations: 8 × 30s @ 100% / 2min Z2 between each
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":600,"power":70,"type":"work"},
  {"duration":30,"power":100,"cadence":110,"type":"work"},{"duration":120,"power":70,"type":"rest"},
  {"duration":30,"power":100,"cadence":110,"type":"work"},{"duration":120,"power":70,"type":"rest"},
  {"duration":30,"power":100,"cadence":110,"type":"work"},{"duration":120,"power":70,"type":"rest"},
  {"duration":30,"power":100,"cadence":110,"type":"work"},{"duration":120,"power":70,"type":"rest"},
  {"duration":30,"power":100,"cadence":110,"type":"work"},{"duration":120,"power":70,"type":"rest"},
  {"duration":30,"power":100,"cadence":110,"type":"work"},{"duration":120,"power":70,"type":"rest"},
  {"duration":30,"power":100,"cadence":110,"type":"work"},{"duration":120,"power":70,"type":"rest"},
  {"duration":30,"power":100,"cadence":110,"type":"work"},
  {"duration":1200,"power":70,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Endurance with Accelerations';

-- Endurance Ride with Surges: 6 × 1min @ 85% / 5min Z2 between each
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":900,"power":70,"type":"work"},
  {"duration":60,"power":85,"type":"work"},{"duration":300,"power":68,"type":"rest"},
  {"duration":60,"power":85,"type":"work"},{"duration":300,"power":68,"type":"rest"},
  {"duration":60,"power":85,"type":"work"},{"duration":300,"power":68,"type":"rest"},
  {"duration":60,"power":85,"type":"work"},{"duration":300,"power":68,"type":"rest"},
  {"duration":60,"power":85,"type":"work"},{"duration":300,"power":68,"type":"rest"},
  {"duration":60,"power":85,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Endurance Ride with Surges';

-- Zwift Workout — Sprints & Endurance: 4 × 15s @ 135% / 105s Z2 between each
UPDATE workout_templates SET intervals = '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":600,"power":70,"type":"work"},
  {"duration":15,"power":135,"type":"work"},{"duration":105,"power":68,"type":"rest"},
  {"duration":15,"power":135,"type":"work"},{"duration":105,"power":68,"type":"rest"},
  {"duration":15,"power":135,"type":"work"},{"duration":105,"power":68,"type":"rest"},
  {"duration":15,"power":135,"type":"work"},
  {"duration":1800,"power":72,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb WHERE name = 'Zwift Workout — Sprints & Endurance';

-- ═══════════════════════════════════════════════════════════════════
-- NEW: Missing VO2max micro-interval formats
-- ═══════════════════════════════════════════════════════════════════

-- 30/30 VO2max: 3 sets of 8 × (30s @ 120% / 30s @ 55%), 4min rest between sets
INSERT INTO workout_templates (name, description, workout_type, duration_minutes, tss_estimate, difficulty, tags, intervals) VALUES
('30/30 VO2max Intervals',
 '3 sets of 8 × 30s on / 30s off at 120% FTP. Classic Billat-style VO2max builder — accumulates 12 minutes at VO2max intensity with equal rest.',
 'vo2max', 55, 78, 'very_hard', ARRAY['vo2max','microintervals','30-30','intervals'],
 '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},
  {"duration":240,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},
  {"duration":240,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},{"duration":30,"power":55,"type":"rest"},
  {"duration":30,"power":120,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb),

-- 20/40 VO2max: 2 sets of 10 × (20s @ 130% / 40s @ 55%), 5min rest between sets
('20/40 VO2max Intervals',
 '2 sets of 10 × 20s on / 40s off at 130% FTP. Short explosive bursts with generous rest keep you near VO2max without deep fatigue.',
 'vo2max', 50, 70, 'very_hard', ARRAY['vo2max','microintervals','20-40','intervals'],
 '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},
  {"duration":300,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},{"duration":40,"power":55,"type":"rest"},
  {"duration":20,"power":130,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb),

-- Rønnestad 15/15: 3 sets of 13 × (15s @ 130% / 15s @ 55%), 3min rest between sets
('Rønnestad 15/15 Intervals',
 '3 sets of 13 × 15s on / 15s off at 130% FTP. Research-backed protocol shown to improve VO2max more than traditional long intervals in trained cyclists.',
 'vo2max', 50, 75, 'very_hard', ARRAY['vo2max','microintervals','15-15','ronnestad','intervals'],
 '[
  {"duration":600,"power":62,"type":"warmup"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},
  {"duration":180,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},
  {"duration":180,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},{"duration":15,"power":55,"type":"rest"},
  {"duration":15,"power":130,"type":"work"},
  {"duration":300,"power":55,"type":"cooldown"}
]'::jsonb);
