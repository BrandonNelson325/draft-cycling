-- Global workout template library
-- Templates are shared across all athletes (no athlete_id FK).
-- Athletes still get their own workout rows when a plan is scheduled
-- (cloned from a template), but the template definitions live here.

CREATE TABLE IF NOT EXISTS workout_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  workout_type TEXT NOT NULL CHECK (workout_type IN ('endurance','tempo','threshold','vo2max','sprint','recovery','custom')),
  duration_minutes INTEGER NOT NULL,
  tss_estimate INTEGER,           -- approximate TSS at 100% FTP; scales with athlete FTP
  difficulty TEXT CHECK (difficulty IN ('easy','moderate','hard','very_hard')),
  tags        TEXT[],             -- e.g. ['base','sweetspot','beginner']
  intervals   JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- No RLS needed — this table is read-only for athletes, managed by service role only
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read templates" ON workout_templates FOR SELECT USING (true);

-- ─── SEED DATA ───────────────────────────────────────────────────────────────
-- ~80 templates covering all training types and durations
-- Power values are % of FTP (e.g. 75 = 75% FTP)

INSERT INTO workout_templates (name, description, workout_type, duration_minutes, tss_estimate, difficulty, tags, intervals) VALUES

-- ═══════════════════════════════════════════════════════════════════
-- RECOVERY (easy, short)
-- ═══════════════════════════════════════════════════════════════════
('30-Minute Recovery Spin',
 'Very easy spin to flush legs and promote active recovery. Keep power well below threshold and heart rate low.',
 'recovery', 30, 25, 'easy', ARRAY['recovery','active-recovery','short'],
 '[{"duration":1800,"power":50,"type":"work"}]'),

('45-Minute Recovery Ride',
 'Easy aerobic recovery ride. Focus on smooth pedaling and relaxation.',
 'recovery', 45, 35, 'easy', ARRAY['recovery','active-recovery'],
 '[{"duration":2700,"power":50,"type":"work"}]'),

('60-Minute Easy Recovery',
 'Low-intensity recovery ride. Perfect for the day after a hard effort.',
 'recovery', 60, 45, 'easy', ARRAY['recovery','active-recovery'],
 '[{"duration":600,"power":50,"type":"warmup"},{"duration":2400,"power":50,"type":"work"},{"duration":600,"power":45,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- ENDURANCE (aerobic base, Z2)
-- ═══════════════════════════════════════════════════════════════════
('45-Minute Endurance',
 'Steady aerobic ride at Zone 2. Build your aerobic base.',
 'endurance', 45, 45, 'easy', ARRAY['endurance','base','z2'],
 '[{"duration":300,"power":60,"type":"warmup"},{"duration":2100,"power":72,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('60-Minute Endurance Ride',
 'Classic aerobic base ride at 65-75% FTP. The foundation of all good training.',
 'endurance', 60, 60, 'easy', ARRAY['endurance','base','z2'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":2700,"power":70,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('90-Minute Endurance',
 'Longer aerobic base ride. Builds fat oxidation and cardiac efficiency.',
 'endurance', 90, 85, 'moderate', ARRAY['endurance','base','z2','long'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":4500,"power":70,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('2-Hour Base Endurance',
 'Two-hour aerobic ride for serious base building.',
 'endurance', 120, 110, 'moderate', ARRAY['endurance','base','z2','long'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":6300,"power":70,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('2.5-Hour Long Ride',
 'Extended endurance ride. Great for weekends when time allows.',
 'endurance', 150, 135, 'moderate', ARRAY['endurance','base','z2','long','weekend'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":8100,"power":70,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('3-Hour Long Endurance',
 'Long aerobic ride to build top-end aerobic capacity and mental toughness.',
 'endurance', 180, 160, 'hard', ARRAY['endurance','base','z2','long','weekend'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":9900,"power":70,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Endurance with Accelerations',
 '75-minute Z2 ride with short high-cadence accelerations to keep legs sharp.',
 'endurance', 75, 70, 'moderate', ARRAY['endurance','base','cadence'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":600,"power":70,"type":"work"},{"duration":30,"power":100,"cadence":110,"type":"work","repeat":8},{"duration":120,"power":65,"type":"rest"},{"duration":1200,"power":70,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- TEMPO (Z3, 76-90% FTP)
-- ═══════════════════════════════════════════════════════════════════
('30-Minute Tempo',
 'Single sustained tempo effort. Good introduction to higher-intensity work.',
 'tempo', 50, 60, 'moderate', ARRAY['tempo','z3','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":1800,"power":83,"type":"work"},{"duration":600,"power":55,"type":"cooldown"}]'),

('2x20 Tempo',
 'Two 20-minute tempo blocks at 80-85% FTP. Classic tempo workout.',
 'tempo', 60, 75, 'moderate', ARRAY['tempo','z3','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":1200,"power":83,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":1200,"power":83,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('3x15 Tempo',
 'Three 15-minute tempo blocks. Good stepping stone before 2x20.',
 'tempo', 65, 70, 'moderate', ARRAY['tempo','z3','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":900,"power":83,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":900,"power":83,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":900,"power":83,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Tempo Cruise Intervals',
 '4x10-min tempo with short recoveries. Great for building sustained power.',
 'tempo', 65, 70, 'moderate', ARRAY['tempo','z3','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":600,"power":83,"type":"work","repeat":4},{"duration":180,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('40-Minute Sustained Tempo',
 'Long single-block tempo effort. Builds lactate threshold.',
 'tempo', 65, 78, 'hard', ARRAY['tempo','z3','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":2400,"power":83,"type":"work"},{"duration":600,"power":55,"type":"cooldown"}]'),

('Tempo Pyramid',
 'Tempo intervals that increase then decrease in duration. 10-15-20-15-10 min.',
 'tempo', 90, 90, 'hard', ARRAY['tempo','z3','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":600,"power":83,"type":"work"},{"duration":180,"power":55,"type":"rest"},{"duration":900,"power":83,"type":"work"},{"duration":180,"power":55,"type":"rest"},{"duration":1200,"power":83,"type":"work"},{"duration":180,"power":55,"type":"rest"},{"duration":900,"power":83,"type":"work"},{"duration":180,"power":55,"type":"rest"},{"duration":600,"power":83,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- SWEET SPOT (88-93% FTP — the most efficient training zone)
-- ═══════════════════════════════════════════════════════════════════
('Sweet Spot 2x20',
 'Two 20-minute sweet spot efforts at 88-92% FTP. Best bang for your training buck.',
 'threshold', 60, 85, 'hard', ARRAY['sweetspot','build','efficient'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":1200,"power":90,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":1200,"power":90,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Sweet Spot 3x15',
 'Three 15-minute sweet spot blocks. Great for building fatigue resistance.',
 'threshold', 65, 80, 'hard', ARRAY['sweetspot','build','efficient'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":900,"power":90,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":900,"power":90,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":900,"power":90,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Sweet Spot Progression',
 '3 blocks that progressively increase duration: 15-20-25 min at sweet spot.',
 'threshold', 90, 100, 'hard', ARRAY['sweetspot','build','progression'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":900,"power":90,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":1200,"power":90,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":1500,"power":90,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Sweet Spot 1x40',
 'Single 40-minute sustained sweet spot block. Race-simulation endurance.',
 'threshold', 65, 92, 'hard', ARRAY['sweetspot','build','sustained'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":2400,"power":90,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Over-Under Sweet Spot',
 'Alternates between sweet spot and just above FTP to boost lactate clearance.',
 'threshold', 70, 95, 'very_hard', ARRAY['sweetspot','over-under','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":240,"power":90,"type":"work"},{"duration":60,"power":105,"type":"work"},{"duration":240,"power":90,"type":"work"},{"duration":60,"power":105,"type":"work"},{"duration":240,"power":90,"type":"work"},{"duration":60,"power":105,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":240,"power":90,"type":"work"},{"duration":60,"power":105,"type":"work"},{"duration":240,"power":90,"type":"work"},{"duration":60,"power":105,"type":"work"},{"duration":240,"power":90,"type":"work"},{"duration":60,"power":105,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- THRESHOLD (FTP work, 95-105%)
-- ═══════════════════════════════════════════════════════════════════
('FTP 2x20',
 'Classic FTP intervals. Two 20-minute blocks at 95-100% FTP.',
 'threshold', 60, 100, 'very_hard', ARRAY['threshold','ftp','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":1200,"power":98,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":1200,"power":98,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('FTP 3x12',
 'Three 12-minute threshold blocks. Lower volume, high quality.',
 'threshold', 55, 85, 'very_hard', ARRAY['threshold','ftp','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":720,"power":98,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":720,"power":98,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":720,"power":98,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('FTP 5x8',
 'Five 8-minute blocks at FTP. Good for practicing threshold pacing.',
 'threshold', 65, 90, 'very_hard', ARRAY['threshold','ftp','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":480,"power":100,"type":"work","repeat":5},{"duration":240,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('30-Minute FTP Effort',
 'Single 30-minute block at FTP. The gold standard for threshold fitness.',
 'threshold', 50, 97, 'very_hard', ARRAY['threshold','ftp','sustained'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":1800,"power":100,"type":"work"},{"duration":600,"power":55,"type":"cooldown"}]'),

('Threshold Cruise 4x10',
 'Four 10-min threshold blocks with 2-min recoveries.',
 'threshold', 60, 88, 'very_hard', ARRAY['threshold','ftp','build'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":600,"power":100,"type":"work","repeat":4},{"duration":120,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- VO2MAX (106-120% FTP)
-- ═══════════════════════════════════════════════════════════════════
('VO2max 5x3',
 'Five 3-minute VO2max intervals at 110-115% FTP. Develop your aerobic ceiling.',
 'vo2max', 50, 75, 'very_hard', ARRAY['vo2max','intervals','peak'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":180,"power":113,"type":"work","repeat":5},{"duration":180,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('VO2max 4x4',
 'Four 4-minute VO2max blocks. Norwegian-style high-intensity intervals.',
 'vo2max', 50, 75, 'very_hard', ARRAY['vo2max','intervals','peak'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":240,"power":113,"type":"work","repeat":4},{"duration":240,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('VO2max 6x3',
 'Six 3-minute VO2max intervals. High volume VO2 session for advanced athletes.',
 'vo2max', 55, 88, 'very_hard', ARRAY['vo2max','intervals','peak','advanced'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":180,"power":113,"type":"work","repeat":6},{"duration":180,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('VO2max Ladder',
 '2-3-4-3-2 minute VO2max intervals. Progressive structure reduces mental fatigue.',
 'vo2max', 55, 80, 'very_hard', ARRAY['vo2max','intervals','peak'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":120,"power":115,"type":"work"},{"duration":120,"power":55,"type":"rest"},{"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},{"duration":240,"power":112,"type":"work"},{"duration":240,"power":55,"type":"rest"},{"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},{"duration":120,"power":115,"type":"work"},{"duration":120,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Short VO2max 8x2',
 'Eight 2-minute VO2max intervals. High repetitions to accumulate VO2 time.',
 'vo2max', 50, 72, 'very_hard', ARRAY['vo2max','intervals','peak'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":120,"power":116,"type":"work","repeat":8},{"duration":120,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('VO2max 3x5',
 'Three long 5-minute VO2max blocks. Harder to sustain, greater adaptation.',
 'vo2max', 50, 78, 'very_hard', ARRAY['vo2max','intervals','peak','advanced'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":300,"power":110,"type":"work","repeat":3},{"duration":300,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- SPRINT / ANAEROBIC (>120% FTP)
-- ═══════════════════════════════════════════════════════════════════
('Sprint Power Development',
 'Short max-effort sprints to develop neuromuscular power and peak wattage.',
 'sprint', 45, 55, 'very_hard', ARRAY['sprint','anaerobic','power'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":10,"power":160,"type":"work","repeat":8},{"duration":350,"power":50,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('30-Second Power Sprints',
 'Eight 30-second all-out efforts. Develops anaerobic capacity.',
 'sprint', 50, 65, 'very_hard', ARRAY['sprint','anaerobic','power'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":30,"power":150,"type":"work","repeat":8},{"duration":270,"power":50,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Micro-Intervals 30/30',
 '30 seconds on, 30 seconds off — 20 reps. Builds both VO2max and anaerobic capacity.',
 'sprint', 50, 70, 'very_hard', ARRAY['sprint','anaerobic','microintervals','vo2max'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":30,"power":130,"type":"work","repeat":20},{"duration":30,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Tabata Sprints',
 '20s on / 10s off x 8 rounds. True maximum effort each interval.',
 'sprint', 35, 50, 'very_hard', ARRAY['sprint','anaerobic','tabata'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":20,"power":170,"type":"work","repeat":8},{"duration":10,"power":50,"type":"rest"},{"duration":600,"power":55,"type":"cooldown"}]'),

('Attack Simulation',
 'Simulates race attacks: 15s max sprint followed by 2min threshold to hold the gap.',
 'sprint', 55, 72, 'very_hard', ARRAY['sprint','anaerobic','race-prep','attack'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":15,"power":155,"type":"work"},{"duration":120,"power":100,"type":"work"},{"duration":120,"power":55,"type":"rest"},{"duration":15,"power":155,"type":"work"},{"duration":120,"power":100,"type":"work"},{"duration":120,"power":55,"type":"rest"},{"duration":15,"power":155,"type":"work"},{"duration":120,"power":100,"type":"work"},{"duration":120,"power":55,"type":"rest"},{"duration":15,"power":155,"type":"work"},{"duration":120,"power":100,"type":"work"},{"duration":120,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- MIXED / SPECIALTY
-- ═══════════════════════════════════════════════════════════════════
('Pyramid Intervals',
 '1-2-3-4-3-2-1 minute intervals at VO2max, ascending then descending.',
 'vo2max', 60, 80, 'very_hard', ARRAY['vo2max','pyramid','intervals'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":60,"power":116,"type":"work"},{"duration":60,"power":55,"type":"rest"},{"duration":120,"power":114,"type":"work"},{"duration":120,"power":55,"type":"rest"},{"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},{"duration":240,"power":112,"type":"work"},{"duration":240,"power":55,"type":"rest"},{"duration":180,"power":113,"type":"work"},{"duration":180,"power":55,"type":"rest"},{"duration":120,"power":114,"type":"work"},{"duration":120,"power":55,"type":"rest"},{"duration":60,"power":116,"type":"work"},{"duration":60,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Endurance with Tempo Bursts',
 '90-minute endurance ride with 4x5-min tempo efforts to add training stress.',
 'endurance', 90, 85, 'moderate', ARRAY['endurance','tempo','mixed'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":1200,"power":70,"type":"work"},{"duration":300,"power":83,"type":"work"},{"duration":600,"power":70,"type":"rest"},{"duration":300,"power":83,"type":"work"},{"duration":600,"power":70,"type":"rest"},{"duration":300,"power":83,"type":"work"},{"duration":600,"power":70,"type":"rest"},{"duration":300,"power":83,"type":"work"},{"duration":900,"power":68,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Race Simulation',
 '2-hour ride with race-like efforts: tempo surges, sprint finish. Simulates criterium energy systems.',
 'threshold', 120, 120, 'very_hard', ARRAY['race-prep','mixed','advanced'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":2400,"power":70,"type":"work"},{"duration":120,"power":100,"type":"work"},{"duration":300,"power":65,"type":"rest"},{"duration":120,"power":105,"type":"work"},{"duration":300,"power":65,"type":"rest"},{"duration":60,"power":120,"type":"work"},{"duration":300,"power":65,"type":"rest"},{"duration":2400,"power":70,"type":"work"},{"duration":120,"power":103,"type":"work"},{"duration":300,"power":65,"type":"rest"},{"duration":120,"power":108,"type":"work"},{"duration":300,"power":65,"type":"rest"},{"duration":30,"power":150,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Endurance with Sweet Spot',
 '2-hour ride with 2x20-min sweet spot blocks in the middle.',
 'threshold', 120, 115, 'hard', ARRAY['endurance','sweetspot','long'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":1800,"power":70,"type":"work"},{"duration":1200,"power":90,"type":"work"},{"duration":600,"power":65,"type":"rest"},{"duration":1200,"power":90,"type":"work"},{"duration":1200,"power":68,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Zwift Workout — Sprints & Endurance',
 'Indoor ride combining Z2 endurance with short sprint openers. Great for Zwift.',
 'endurance', 60, 65, 'moderate', ARRAY['endurance','sprint','zwift','indoor'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":600,"power":70,"type":"work"},{"duration":15,"power":135,"type":"work","repeat":4},{"duration":345,"power":68,"type":"rest"},{"duration":1800,"power":72,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Climb Simulation',
 '3x10-min sustained efforts simulating a long climb at sweet spot / threshold.',
 'threshold', 65, 90, 'hard', ARRAY['climbing','sweetspot','threshold'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":600,"power":93,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":600,"power":93,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":600,"power":93,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Criterium Power Workout',
 'Simulates crit racing energy demands: repeated short hard efforts with minimal recovery.',
 'sprint', 60, 90, 'very_hard', ARRAY['crit','race-prep','anaerobic','advanced'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":45,"power":130,"type":"work","repeat":12},{"duration":75,"power":65,"type":"rest"},{"duration":600,"power":65,"type":"work"},{"duration":45,"power":130,"type":"work","repeat":8},{"duration":75,"power":65,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- BEGINNER-FRIENDLY PROGRESSIONS
-- ═══════════════════════════════════════════════════════════════════
('Intro to Intervals — 6x5',
 'Six 5-minute efforts at 85% FTP. Great introduction to structured training.',
 'tempo', 60, 65, 'moderate', ARRAY['beginner','tempo','intro'],
 '[{"duration":600,"power":60,"type":"warmup"},{"duration":300,"power":85,"type":"work","repeat":6},{"duration":180,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Beginner Threshold 2x10',
 'Two 10-minute threshold blocks. First step into FTP training.',
 'threshold', 45, 60, 'hard', ARRAY['beginner','threshold','intro'],
 '[{"duration":600,"power":60,"type":"warmup"},{"duration":600,"power":95,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":600,"power":95,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Beginner Endurance 45min',
 'Comfortable 45-minute ride with brief cadence work. For new cyclists.',
 'endurance', 45, 40, 'easy', ARRAY['beginner','endurance','intro'],
 '[{"duration":300,"power":58,"type":"warmup"},{"duration":300,"power":68,"type":"work"},{"duration":60,"power":68,"cadence":100,"type":"work"},{"duration":60,"power":68,"cadence":80,"type":"work"},{"duration":60,"power":68,"cadence":100,"type":"work"},{"duration":60,"power":68,"cadence":80,"type":"work"},{"duration":600,"power":68,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Build Week Intro — Mixed Zones',
 'Tour through all training zones. Gives new riders a taste of structured training.',
 'custom', 55, 60, 'moderate', ARRAY['beginner','mixed','intro'],
 '[{"duration":600,"power":60,"type":"warmup"},{"duration":600,"power":70,"type":"work"},{"duration":300,"power":83,"type":"work"},{"duration":300,"power":65,"type":"rest"},{"duration":300,"power":98,"type":"work"},{"duration":300,"power":60,"type":"rest"},{"duration":120,"power":115,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":600,"power":65,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- TAPER / PRE-RACE
-- ═══════════════════════════════════════════════════════════════════
('Pre-Race Activation',
 'Short race-week workout to stay sharp while conserving energy. Include a few hard efforts.',
 'threshold', 45, 55, 'hard', ARRAY['taper','pre-race','activation'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":600,"power":75,"type":"work"},{"duration":60,"power":105,"type":"work","repeat":3},{"duration":180,"power":55,"type":"rest"},{"duration":600,"power":70,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Race Day Opener',
 '20-minute opener for race morning. Activates the legs with a few hard accelerations.',
 'recovery', 20, 20, 'easy', ARRAY['taper','pre-race','opener'],
 '[{"duration":600,"power":60,"type":"warmup"},{"duration":10,"power":130,"type":"work","repeat":3},{"duration":110,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Taper Week Quality',
 'Maintains neuromuscular sharpness during taper. Short but intense efforts, full recovery.',
 'vo2max', 45, 50, 'very_hard', ARRAY['taper','pre-race','peak'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":60,"power":118,"type":"work","repeat":5},{"duration":180,"power":55,"type":"rest"},{"duration":600,"power":65,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- CADENCE WORK
-- ═══════════════════════════════════════════════════════════════════
('High Cadence Drills',
 'Focused cadence work: alternating high and normal cadence at endurance pace.',
 'endurance', 60, 50, 'easy', ARRAY['cadence','technique','endurance'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":120,"power":68,"cadence":100,"type":"work"},{"duration":120,"power":68,"cadence":80,"type":"work"},{"duration":120,"power":68,"cadence":105,"type":"work"},{"duration":120,"power":68,"cadence":80,"type":"work"},{"duration":120,"power":68,"cadence":110,"type":"work"},{"duration":120,"power":68,"cadence":80,"type":"work"},{"duration":120,"power":68,"cadence":115,"type":"work"},{"duration":120,"power":68,"cadence":80,"type":"work"},{"duration":1200,"power":68,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Single-Leg Drill Ride',
 'Low power single-leg focus intervals to improve pedaling efficiency.',
 'recovery', 45, 30, 'easy', ARRAY['cadence','technique','single-leg'],
 '[{"duration":600,"power":50,"type":"warmup"},{"duration":60,"power":45,"cadence":90,"type":"work"},{"duration":60,"power":45,"cadence":90,"type":"work"},{"duration":300,"power":50,"type":"rest"},{"duration":60,"power":45,"cadence":90,"type":"work"},{"duration":60,"power":45,"cadence":90,"type":"work"},{"duration":300,"power":50,"type":"rest"},{"duration":60,"power":45,"cadence":90,"type":"work"},{"duration":60,"power":45,"cadence":90,"type":"work"},{"duration":600,"power":50,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- ADDITIONAL ENDURANCE VARIATIONS
-- ═══════════════════════════════════════════════════════════════════
('Progressive Endurance 90',
 '90-minute ride that gradually builds from Z1 to Z2/Z3.',
 'endurance', 90, 82, 'moderate', ARRAY['endurance','progressive','base'],
 '[{"duration":600,"power":55,"type":"warmup"},{"duration":1200,"power":65,"type":"work"},{"duration":1200,"power":70,"type":"work"},{"duration":1200,"power":73,"type":"work"},{"duration":1200,"power":76,"type":"work"},{"duration":600,"power":55,"type":"cooldown"}]'),

('Fasted Endurance 60',
 '60-minute moderate endurance ride, ideal for morning fasted training to boost fat oxidation.',
 'endurance', 60, 55, 'easy', ARRAY['endurance','fasted','fat-adaptation'],
 '[{"duration":600,"power":58,"type":"warmup"},{"duration":2700,"power":67,"type":"work"},{"duration":300,"power":53,"type":"cooldown"}]'),

('Endurance Ride with Surges',
 '75-min Z2 ride with 6 x 1-min surges at tempo to build muscular endurance.',
 'endurance', 75, 72, 'moderate', ARRAY['endurance','surges','muscular'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":900,"power":70,"type":"work"},{"duration":60,"power":85,"type":"work","repeat":6},{"duration":300,"power":68,"type":"rest"},{"duration":1200,"power":70,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- ADDITIONAL THRESHOLD / SWEET SPOT
-- ═══════════════════════════════════════════════════════════════════
('Sweet Spot 4x12',
 '4 x 12-minute sweet spot blocks. High-volume sweet spot session.',
 'threshold', 75, 105, 'hard', ARRAY['sweetspot','build','high-volume'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":720,"power":90,"type":"work","repeat":4},{"duration":180,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('Threshold Tolerance 3x20',
 'Three 20-min blocks at FTP. Maximum threshold volume in a single session.',
 'threshold', 90, 125, 'very_hard', ARRAY['threshold','ftp','high-volume','advanced'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":1200,"power":100,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":1200,"power":100,"type":"work"},{"duration":300,"power":55,"type":"rest"},{"duration":1200,"power":100,"type":"work"},{"duration":300,"power":55,"type":"cooldown"}]'),

-- ═══════════════════════════════════════════════════════════════════
-- ADDITIONAL VO2MAX
-- ═══════════════════════════════════════════════════════════════════
('VO2max 10x1',
 'Ten 1-minute VO2max efforts. Short but highly effective.',
 'vo2max', 45, 65, 'very_hard', ARRAY['vo2max','short','intervals'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":60,"power":118,"type":"work","repeat":10},{"duration":60,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]'),

('40-20 VO2max Intervals',
 '40 seconds on / 20 seconds off x 15. Spends maximum time near VO2max.',
 'vo2max', 50, 72, 'very_hard', ARRAY['vo2max','microintervals','time-efficient'],
 '[{"duration":600,"power":62,"type":"warmup"},{"duration":40,"power":125,"type":"work","repeat":15},{"duration":20,"power":55,"type":"rest"},{"duration":300,"power":55,"type":"cooldown"}]');
