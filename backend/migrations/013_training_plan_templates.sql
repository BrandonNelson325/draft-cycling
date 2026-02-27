-- Curated multi-week training plan templates
-- Plans reference workouts by type/difficulty/duration (NOT by UUID),
-- so the tool handler matches to the closest existing workout template at scheduling time.

CREATE TABLE IF NOT EXISTS training_plan_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  description         TEXT NOT NULL,
  target_event        TEXT,
  difficulty_level    TEXT NOT NULL CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  duration_weeks      INTEGER NOT NULL,
  days_per_week       INTEGER NOT NULL,
  hours_per_week_min  NUMERIC(4,1) NOT NULL,
  hours_per_week_max  NUMERIC(4,1) NOT NULL,
  phases              JSONB NOT NULL,
  tags                TEXT[],
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE training_plan_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read plan templates" ON training_plan_templates FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════
-- SEED: 8 curated training plans
-- ═══════════════════════════════════════════════════════════════════

-- 1. Beginner Base Building (8 weeks, 3 days/wk, 6-8 hrs)
INSERT INTO training_plan_templates (name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, phases, tags, sort_order) VALUES
('Beginner Base Building', 'beginner-base-building',
 'Build a solid aerobic foundation with easy-to-moderate rides. Perfect for new cyclists or those returning after a break. Focuses on endurance, pedaling efficiency, and gradually increasing volume.',
 'General Fitness', 'beginner', 8, 3, 6.0, 8.0,
 '[
   {"week_number":1,"phase":"base","description":"Introduction week — easy volume, find your rhythm",
    "workouts":[
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady ride"},
      {"day_offset":3,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin, focus on form"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":75,"notes":"Longer Zone 2 ride"}
    ]},
   {"week_number":2,"phase":"base","description":"Slight volume increase, same intensity",
    "workouts":[
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 with cadence drills"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Long easy ride"}
    ]},
   {"week_number":3,"phase":"base","description":"Introduce light tempo efforts",
    "workouts":[
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"easy","duration_target":50,"notes":"2x10min tempo in Zone 3"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Long endurance ride"}
    ]},
   {"week_number":4,"phase":"base","description":"Recovery week — reduce volume 30%",
    "workouts":[
      {"day_offset":1,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy recovery spin"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Short Zone 2"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Easy long ride"}
    ]},
   {"week_number":5,"phase":"base","description":"Resume building — more tempo",
    "workouts":[
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":65,"notes":"Zone 2 steady"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":55,"notes":"3x10min tempo"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Long endurance ride"}
    ]},
   {"week_number":6,"phase":"base","description":"Peak base volume",
    "workouts":[
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 with tempo finish"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":60,"notes":"3x12min tempo"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":120,"notes":"Longest ride of the plan"}
    ]},
   {"week_number":7,"phase":"base","description":"Consolidation week",
    "workouts":[
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":65,"notes":"Zone 2 steady"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":55,"notes":"2x15min tempo"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Long endurance ride"}
    ]},
   {"week_number":8,"phase":"base","description":"Final week — easy taper, test your fitness",
    "workouts":[
      {"day_offset":1,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy recovery spin"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":50,"notes":"Fitness test: 20min all-out"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":75,"notes":"Easy celebration ride"}
    ]}
 ]'::jsonb,
 ARRAY['beginner','base','aerobic','foundation'], 1);

-- 2. Century Prep (12 weeks, 4-5 days/wk, 8-12 hrs)
INSERT INTO training_plan_templates (name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, phases, tags, sort_order) VALUES
('Century Prep', 'century-prep',
 'Prepare for a 100-mile ride with progressive endurance building, tempo work, and strategic long rides. Builds both the engine and the mental fortitude for century distance.',
 'Century', 'intermediate', 12, 5, 8.0, 12.0,
 '[
   {"week_number":1,"phase":"base","description":"Establish baseline volume",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":60,"notes":"2x15min tempo"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":120,"notes":"Long weekend ride"}
    ]},
   {"week_number":2,"phase":"base","description":"Build volume 5-10%",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":65,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":65,"notes":"3x12min tempo"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":65,"notes":"Zone 2 with cadence work"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":135,"notes":"Long ride — practice fueling"}
    ]},
   {"week_number":3,"phase":"base","description":"Continue volume increase",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":70,"notes":"3x15min tempo"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":65,"notes":"Zone 2 steady"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy recovery"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":150,"notes":"Long ride — 2.5 hrs"}
    ]},
   {"week_number":4,"phase":"base","description":"Recovery week — drop volume 30%",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Short Zone 2"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"easy","duration_target":50,"notes":"Light tempo"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Easy long ride"}
    ]},
   {"week_number":5,"phase":"build","description":"Introduce threshold work",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"moderate","duration_target":65,"notes":"2x15min at threshold"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":65,"notes":"Sweet spot work"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":165,"notes":"Long ride — 2.75 hrs"}
    ]},
   {"week_number":6,"phase":"build","description":"Build threshold capacity",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"moderate","duration_target":70,"notes":"3x12min at threshold"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":70,"notes":"Tempo with Z2 recovery"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":180,"notes":"3-hour long ride"}
    ]},
   {"week_number":7,"phase":"build","description":"Peak build volume",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":75,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":70,"notes":"3x15min at threshold"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":70,"notes":"Tempo intervals"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":195,"notes":"Long ride — biggest week"}
    ]},
   {"week_number":8,"phase":"build","description":"Recovery week",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy recovery"},
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":55,"notes":"Short Zone 2"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"easy","duration_target":50,"notes":"Light tempo"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Moderate long ride"}
    ]},
   {"week_number":9,"phase":"peak","description":"Race-pace simulation",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":70,"notes":"Race-pace intervals"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":65,"notes":"Sustained tempo"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":210,"notes":"Dress rehearsal: 3.5 hrs"}
    ]},
   {"week_number":10,"phase":"peak","description":"Final big week",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"moderate","duration_target":65,"notes":"Threshold work"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":65,"notes":"Sweet spot"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":180,"notes":"Long ride — last big one"}
    ]},
   {"week_number":11,"phase":"taper","description":"Taper begins — volume drops 30%",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":55,"notes":"Short Zone 2"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":50,"notes":"Short opener intervals"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Easy long ride"}
    ]},
   {"week_number":12,"phase":"taper","description":"Race week — stay sharp, stay fresh",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":40,"notes":"Easy spin"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"easy","duration_target":40,"notes":"Short openers — 4x3min"},
      {"day_offset":3,"workout_type":"recovery","difficulty":"easy","duration_target":30,"notes":"Very easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":30,"notes":"Pre-event shakeout"}
    ]}
 ]'::jsonb,
 ARRAY['century','endurance','intermediate','event-prep'], 2);

-- 3. Crit Racing (8 weeks, 5 days/wk, 8-10 hrs)
INSERT INTO training_plan_templates (name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, phases, tags, sort_order) VALUES
('Crit Racing', 'crit-racing',
 'Sharpen your criterium racing skills with high-intensity intervals, sprint work, and race-pace simulations. Requires a solid aerobic base before starting.',
 'Criterium', 'advanced', 8, 5, 8.0, 10.0,
 '[
   {"week_number":1,"phase":"build","description":"Establish intensity baseline",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"vo2max","difficulty":"hard","duration_target":60,"notes":"5x3min VO2max efforts"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"threshold","difficulty":"hard","duration_target":65,"notes":"3x10min at threshold"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Long Zone 2 ride"}
    ]},
   {"week_number":2,"phase":"build","description":"Build VO2max capacity",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"vo2max","difficulty":"hard","duration_target":65,"notes":"6x3min VO2max"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"threshold","difficulty":"hard","duration_target":65,"notes":"2x15min at threshold"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Long ride with surges"}
    ]},
   {"week_number":3,"phase":"build","description":"Introduce sprint work",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"sprint","difficulty":"very_hard","duration_target":55,"notes":"8x30s sprints, full recovery"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"vo2max","difficulty":"hard","duration_target":65,"notes":"5x4min VO2max"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Endurance with race surges"}
    ]},
   {"week_number":4,"phase":"build","description":"Recovery week",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":55,"notes":"Short Zone 2"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"easy","duration_target":50,"notes":"Light tempo"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":75,"notes":"Easy long ride"}
    ]},
   {"week_number":5,"phase":"peak","description":"Race-specific intensity",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"vo2max","difficulty":"very_hard","duration_target":65,"notes":"Race simulation intervals"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"sprint","difficulty":"very_hard","duration_target":55,"notes":"Sprint + threshold combos"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Long ride with attacks"}
    ]},
   {"week_number":6,"phase":"peak","description":"Peak intensity block",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"vo2max","difficulty":"very_hard","duration_target":65,"notes":"Crit simulation: variable power"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"sprint","difficulty":"very_hard","duration_target":55,"notes":"Sprint out of corners"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Long ride"}
    ]},
   {"week_number":7,"phase":"taper","description":"Reduce volume, maintain intensity",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Short Zone 2"},
      {"day_offset":1,"workout_type":"vo2max","difficulty":"hard","duration_target":50,"notes":"Short sharp intervals"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":40,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"sprint","difficulty":"hard","duration_target":45,"notes":"Race openers"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Easy long ride"}
    ]},
   {"week_number":8,"phase":"taper","description":"Race week — stay sharp",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":40,"notes":"Easy spin"},
      {"day_offset":1,"workout_type":"sprint","difficulty":"hard","duration_target":40,"notes":"Race openers: 4x20s sprints"},
      {"day_offset":3,"workout_type":"recovery","difficulty":"easy","duration_target":30,"notes":"Very easy spin"},
      {"day_offset":5,"workout_type":"recovery","difficulty":"easy","duration_target":25,"notes":"Pre-race shakeout"}
    ]}
 ]'::jsonb,
 ARRAY['crit','racing','advanced','high-intensity','sprint'], 3);

-- 4. Gran Fondo (12 weeks, 5 days/wk, 8-14 hrs)
INSERT INTO training_plan_templates (name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, phases, tags, sort_order) VALUES
('Gran Fondo', 'gran-fondo',
 'Complete preparation for a Gran Fondo or sportive. Builds sustained power for long climbing efforts, pacing strategy, and the ability to ride hard after hours in the saddle.',
 'Gran Fondo', 'intermediate', 12, 5, 8.0, 14.0,
 '[
   {"week_number":1,"phase":"base","description":"Establish endurance baseline",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":65,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":60,"notes":"2x15min tempo"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":65,"notes":"Zone 2 with cadence work"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":135,"notes":"Long ride — 2.25 hrs"}
    ]},
   {"week_number":2,"phase":"base","description":"Build aerobic volume",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":65,"notes":"3x12min tempo"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":65,"notes":"Zone 2"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":150,"notes":"Long ride — 2.5 hrs"}
    ]},
   {"week_number":3,"phase":"base","description":"Peak base volume",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":70,"notes":"3x15min tempo"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":165,"notes":"Long ride — 2.75 hrs"}
    ]},
   {"week_number":4,"phase":"base","description":"Recovery week",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy recovery"},
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Short Zone 2"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"easy","duration_target":50,"notes":"Light tempo"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Easy long ride"}
    ]},
   {"week_number":5,"phase":"build","description":"Introduce threshold climbing efforts",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"moderate","duration_target":70,"notes":"2x15min climbing simulation"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":65,"notes":"Sweet spot work"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":180,"notes":"3-hour long ride with hills"}
    ]},
   {"week_number":6,"phase":"build","description":"Build climbing strength",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":70,"notes":"3x12min at threshold"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":70,"notes":"Sustained tempo"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":195,"notes":"Long ride — 3.25 hrs"}
    ]},
   {"week_number":7,"phase":"build","description":"Peak build week",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":75,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":75,"notes":"3x15min at threshold"},
      {"day_offset":3,"workout_type":"vo2max","difficulty":"hard","duration_target":65,"notes":"VO2max for climbing punch"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":210,"notes":"3.5-hour long ride"}
    ]},
   {"week_number":8,"phase":"build","description":"Recovery week",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy recovery"},
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":55,"notes":"Short Zone 2"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"easy","duration_target":50,"notes":"Light tempo"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Moderate long ride"}
    ]},
   {"week_number":9,"phase":"peak","description":"Race-pace simulation",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":70,"notes":"Race-pace climbing intervals"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":65,"notes":"Sustained tempo"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":240,"notes":"Dress rehearsal: 4 hours"}
    ]},
   {"week_number":10,"phase":"peak","description":"Final peak week",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"moderate","duration_target":65,"notes":"Threshold work"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":65,"notes":"Sweet spot"},
      {"day_offset":4,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":195,"notes":"Last long ride"}
    ]},
   {"week_number":11,"phase":"taper","description":"Taper — volume drops 30%",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":55,"notes":"Short Zone 2"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":50,"notes":"Short openers"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Easy spin"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Easy long ride"}
    ]},
   {"week_number":12,"phase":"taper","description":"Event week",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":40,"notes":"Easy spin"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"easy","duration_target":40,"notes":"Short openers: 3x5min"},
      {"day_offset":3,"workout_type":"recovery","difficulty":"easy","duration_target":30,"notes":"Very easy spin"},
      {"day_offset":5,"workout_type":"recovery","difficulty":"easy","duration_target":25,"notes":"Pre-event shakeout"}
    ]}
 ]'::jsonb,
 ARRAY['gran-fondo','sportive','climbing','endurance','intermediate'], 4);

-- 5. Time Trial Specialist (8 weeks, 5 days/wk, 7-10 hrs)
INSERT INTO training_plan_templates (name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, phases, tags, sort_order) VALUES
('Time Trial Specialist', 'time-trial-specialist',
 'Maximize sustained power output for time trials. Heavy emphasis on threshold and sweet spot work, pacing strategy, and aerobic efficiency. Best for athletes who already have a solid base.',
 'Time Trial', 'advanced', 8, 5, 7.0, 10.0,
 '[
   {"week_number":1,"phase":"build","description":"Establish TT baseline",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"moderate","duration_target":65,"notes":"2x15min at threshold"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":60,"notes":"Sweet spot intervals"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Long Zone 2 ride"}
    ]},
   {"week_number":2,"phase":"build","description":"Build threshold duration",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":70,"notes":"2x20min at threshold"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":65,"notes":"Sweet spot: 3x12min"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Long ride with tempo finish"}
    ]},
   {"week_number":3,"phase":"build","description":"Extended threshold efforts",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":70,"notes":"1x30min at threshold"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"vo2max","difficulty":"hard","duration_target":60,"notes":"5x3min VO2max for top end"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Long ride"}
    ]},
   {"week_number":4,"phase":"build","description":"Recovery week",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy recovery"},
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Short Zone 2"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"easy","duration_target":50,"notes":"Light sweet spot"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":75,"notes":"Easy long ride"}
    ]},
   {"week_number":5,"phase":"peak","description":"Race-pace simulation",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"very_hard","duration_target":70,"notes":"TT simulation: 1x40min"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"vo2max","difficulty":"hard","duration_target":60,"notes":"VO2max top-end"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Long ride"}
    ]},
   {"week_number":6,"phase":"peak","description":"Peak TT-specific work",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"very_hard","duration_target":70,"notes":"TT pacing: negative split practice"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"threshold","difficulty":"hard","duration_target":60,"notes":"2x20min at race pace"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Long ride"}
    ]},
   {"week_number":7,"phase":"taper","description":"Taper — maintain sharpness",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Short Zone 2"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":55,"notes":"Short TT efforts"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":40,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":45,"notes":"Race-pace openers"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":70,"notes":"Easy long ride"}
    ]},
   {"week_number":8,"phase":"taper","description":"Race week",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":40,"notes":"Easy spin"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"moderate","duration_target":40,"notes":"Openers: 3x5min at TT pace"},
      {"day_offset":3,"workout_type":"recovery","difficulty":"easy","duration_target":30,"notes":"Very easy spin"},
      {"day_offset":5,"workout_type":"recovery","difficulty":"easy","duration_target":25,"notes":"Pre-race shakeout"}
    ]}
 ]'::jsonb,
 ARRAY['time-trial','tt','threshold','advanced','sustained-power'], 5);

-- 6. Recovery Block (4 weeks, 3 days/wk, 4-6 hrs)
INSERT INTO training_plan_templates (name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, phases, tags, sort_order) VALUES
('Recovery Block', 'recovery-block',
 'A structured recovery period after a race block, intense training, or when feeling overtrained. Gradually rebuilds fitness while prioritizing rest and adaptation. No hard efforts.',
 'Recovery', 'beginner', 4, 3, 4.0, 6.0,
 '[
   {"week_number":1,"phase":"base","description":"Deep recovery — minimal volume",
    "workouts":[
      {"day_offset":1,"workout_type":"recovery","difficulty":"easy","duration_target":40,"notes":"Very easy spin, RPE 2-3"},
      {"day_offset":3,"workout_type":"recovery","difficulty":"easy","duration_target":40,"notes":"Easy spin with gentle cadence"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Short Zone 2, no pushing"}
    ]},
   {"week_number":2,"phase":"base","description":"Gentle volume increase",
    "workouts":[
      {"day_offset":1,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Zone 2 steady, low cadence"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 ride"}
    ]},
   {"week_number":3,"phase":"base","description":"Reintroduce light tempo",
    "workouts":[
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Zone 2 steady"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"easy","duration_target":50,"notes":"1x10min light tempo"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":75,"notes":"Longer Zone 2 ride"}
    ]},
   {"week_number":4,"phase":"base","description":"Ready to resume normal training",
    "workouts":[
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":55,"notes":"Zone 2 steady"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":55,"notes":"2x10min tempo test"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":80,"notes":"Graduation ride — how do you feel?"}
    ]}
 ]'::jsonb,
 ARRAY['recovery','rest','easy','deload','beginner'], 6);

-- 7. General Fitness (8 weeks, 4 days/wk, 5-8 hrs)
INSERT INTO training_plan_templates (name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, phases, tags, sort_order) VALUES
('General Fitness', 'general-fitness',
 'A balanced plan for cyclists who want to improve overall fitness without targeting a specific event. Mixes endurance, tempo, threshold, and VO2max to build a well-rounded rider.',
 'General Fitness', 'intermediate', 8, 4, 5.0, 8.0,
 '[
   {"week_number":1,"phase":"base","description":"Establish training rhythm",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":55,"notes":"2x12min tempo"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":55,"notes":"Zone 2 with drills"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Long weekend ride"}
    ]},
   {"week_number":2,"phase":"base","description":"Build volume slightly",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":60,"notes":"3x10min tempo"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Long ride"}
    ]},
   {"week_number":3,"phase":"build","description":"Introduce threshold work",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"moderate","duration_target":60,"notes":"2x12min at threshold"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":55,"notes":"Sweet spot work"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Long ride"}
    ]},
   {"week_number":4,"phase":"build","description":"Recovery week",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Short Zone 2"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"easy","duration_target":45,"notes":"Light tempo"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":75,"notes":"Easy long ride"}
    ]},
   {"week_number":5,"phase":"build","description":"Mixed intensity",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"vo2max","difficulty":"hard","duration_target":55,"notes":"4x3min VO2max"},
      {"day_offset":3,"workout_type":"threshold","difficulty":"moderate","duration_target":60,"notes":"2x15min at threshold"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Long ride with tempo finish"}
    ]},
   {"week_number":6,"phase":"build","description":"Peak intensity",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"vo2max","difficulty":"hard","duration_target":60,"notes":"5x3min VO2max"},
      {"day_offset":3,"workout_type":"threshold","difficulty":"hard","duration_target":65,"notes":"3x12min at threshold"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":120,"notes":"Long ride"}
    ]},
   {"week_number":7,"phase":"build","description":"Consolidation",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"moderate","duration_target":60,"notes":"2x15min at threshold"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":55,"notes":"Sweet spot"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Long ride"}
    ]},
   {"week_number":8,"phase":"base","description":"Final week — test fitness",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":55,"notes":"FTP test: 20min all-out"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Easy recovery"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Celebration ride"}
    ]}
 ]'::jsonb,
 ARRAY['general','fitness','all-around','intermediate'], 7);

-- 8. Sweet Spot Base (6 weeks, 5 days/wk, 7-10 hrs)
INSERT INTO training_plan_templates (name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, phases, tags, sort_order) VALUES
('Sweet Spot Base', 'sweet-spot-base',
 'Build a bulletproof aerobic engine using sweet spot training (88-93% FTP). Maximum fitness gains per hour invested. Ideal for time-crunched athletes or as a bridge between base and build phases.',
 'Base Building', 'intermediate', 6, 5, 7.0, 10.0,
 '[
   {"week_number":1,"phase":"base","description":"Introduce sweet spot",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":60,"notes":"2x15min sweet spot (88-93% FTP)"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":105,"notes":"Long Zone 2 ride"}
    ]},
   {"week_number":2,"phase":"base","description":"Build sweet spot duration",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"moderate","duration_target":65,"notes":"2x20min sweet spot"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":55,"notes":"3x10min sweet spot"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":120,"notes":"Long ride"}
    ]},
   {"week_number":3,"phase":"base","description":"Extended sweet spot efforts",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"tempo","difficulty":"hard","duration_target":70,"notes":"3x15min sweet spot"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"moderate","duration_target":60,"notes":"2x20min sweet spot"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":120,"notes":"Long ride with tempo finish"}
    ]},
   {"week_number":4,"phase":"base","description":"Recovery week",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":1,"workout_type":"endurance","difficulty":"easy","duration_target":50,"notes":"Short Zone 2"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"easy","duration_target":45,"notes":"Light sweet spot"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":75,"notes":"Easy long ride"}
    ]},
   {"week_number":5,"phase":"build","description":"Peak sweet spot with threshold exposure",
    "workouts":[
      {"day_offset":0,"workout_type":"endurance","difficulty":"easy","duration_target":60,"notes":"Zone 2 steady"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":70,"notes":"2x20min at threshold"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":3,"workout_type":"tempo","difficulty":"hard","duration_target":65,"notes":"3x15min sweet spot"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":120,"notes":"Long ride"}
    ]},
   {"week_number":6,"phase":"build","description":"Final week — fitness test",
    "workouts":[
      {"day_offset":0,"workout_type":"recovery","difficulty":"easy","duration_target":45,"notes":"Easy spin"},
      {"day_offset":1,"workout_type":"threshold","difficulty":"hard","duration_target":60,"notes":"FTP retest: 20min all-out"},
      {"day_offset":2,"workout_type":"recovery","difficulty":"easy","duration_target":40,"notes":"Recovery spin"},
      {"day_offset":3,"workout_type":"endurance","difficulty":"easy","duration_target":55,"notes":"Easy Zone 2"},
      {"day_offset":5,"workout_type":"endurance","difficulty":"easy","duration_target":90,"notes":"Easy graduation ride"}
    ]}
 ]'::jsonb,
 ARRAY['sweet-spot','base','threshold','time-crunched','intermediate'], 8);
