/**
 * How a NON-cycling activity (or a ride with no power) affects CYCLING training.
 * Pure + exported for tests (npm run test:cross-training).
 *
 * 1. Systemic load (est_tss): heart-rate TSS when HR exists — duration ×
 *    IF² × 100 with IF from heart-rate reserve vs threshold HR — so it reflects
 *    how hard THIS athlete actually worked. No HR → duration × a typical
 *    intensity for the sport.
 * 2. Two sport-specific multipliers on top:
 *    - fatigueWeight: how hard it hits CYCLING LEGS. Running is >1 because
 *      impact/eccentric load leaves legs heavier than HR suggests; swimming and
 *      paddling are <1 (mostly upper body).            → feeds ATL (fatigue)
 *    - fitnessTransfer: how much it builds CYCLING fitness. Rowing / Nordic ski
 *      are high, running partial, strength/yoga none.  → feeds CTL (fitness)
 * Rides keep power-based TSS; a ride without power uses the HR path at 1/1.
 */

export type ActivityCategory =
  | 'ride' | 'run' | 'trail_run' | 'walk' | 'hike' | 'swim' | 'row' | 'paddle'
  | 'nordic_ski' | 'alpine_ski' | 'strength' | 'mobility' | 'team_sport'
  | 'racket' | 'climb' | 'skate' | 'other';

interface CategoryProfile {
  /** Typical intensity factor when there's no heart rate. */
  defaultIF: number;
  fatigueWeight: number;
  fitnessTransfer: number;
  /** Floor for HR-based IF — HR undersells muscular work (lifting, alpine). */
  minIF?: number;
  label: string;
  /** One line the coach uses to reason about the next days. */
  note: string;
}

export const CATEGORY_PROFILES: Record<ActivityCategory, CategoryProfile> = {
  ride:       { defaultIF: 0.70, fatigueWeight: 1.0,  fitnessTransfer: 1.0, label: 'Ride', note: 'cycling' },
  run:        { defaultIF: 0.80, fatigueWeight: 1.25, fitnessTransfer: 0.6, label: 'Run', note: 'leg-heavy (impact + eccentric) — legs feel it more than HR shows; expect heavier legs for 24–48h' },
  trail_run:  { defaultIF: 0.80, fatigueWeight: 1.35, fitnessTransfer: 0.6, label: 'Trail run', note: 'very leg-heavy (downhills are eccentric) — soreness can peak 24–48h later' },
  walk:       { defaultIF: 0.45, fatigueWeight: 0.5,  fitnessTransfer: 0.1, label: 'Walk', note: 'light — active recovery' },
  hike:       { defaultIF: 0.60, fatigueWeight: 0.9,  fitnessTransfer: 0.3, label: 'Hike', note: 'moderate leg load; long descents add eccentric soreness' },
  swim:       { defaultIF: 0.70, fatigueWeight: 0.5,  fitnessTransfer: 0.4, label: 'Swim', note: 'aerobic, low leg load — little effect on cycling legs' },
  row:        { defaultIF: 0.80, fatigueWeight: 0.9,  fitnessTransfer: 0.7, label: 'Row', note: 'big aerobic load with real leg drive' },
  paddle:     { defaultIF: 0.60, fatigueWeight: 0.4,  fitnessTransfer: 0.3, label: 'Paddle', note: 'mostly upper body — light on cycling legs' },
  nordic_ski: { defaultIF: 0.80, fatigueWeight: 1.0,  fitnessTransfer: 0.8, label: 'Nordic ski', note: 'excellent aerobic crossover, full-body' },
  alpine_ski: { defaultIF: 0.55, fatigueWeight: 1.1,  fitnessTransfer: 0.1, minIF: 0.55, label: 'Alpine ski', note: 'heavy quad load with little aerobic benefit' },
  strength:   { defaultIF: 0.60, fatigueWeight: 1.0,  fitnessTransfer: 0.0, minIF: 0.60, label: 'Strength', note: 'muscular fatigue HR undersells — a leg session can leave DOMS for 24–72h' },
  mobility:   { defaultIF: 0.30, fatigueWeight: 0.2,  fitnessTransfer: 0.0, label: 'Mobility/yoga', note: 'recovery-friendly' },
  team_sport: { defaultIF: 0.80, fatigueWeight: 1.2,  fitnessTransfer: 0.4, label: 'Team sport', note: 'sprints, cuts and impact — legs take more than HR shows' },
  racket:     { defaultIF: 0.70, fatigueWeight: 0.9,  fitnessTransfer: 0.3, label: 'Racket sport', note: 'stop-start leg load' },
  climb:      { defaultIF: 0.60, fatigueWeight: 0.4,  fitnessTransfer: 0.1, label: 'Climbing', note: 'upper body/grip — light on cycling legs' },
  skate:      { defaultIF: 0.65, fatigueWeight: 0.9,  fitnessTransfer: 0.4, label: 'Skating', note: 'leg-dominant, moderate' },
  other:      { defaultIF: 0.60, fatigueWeight: 0.8,  fitnessTransfer: 0.3, label: 'Other', note: 'general load' },
};

const RIDE_TYPES = new Set(['Ride', 'VirtualRide', 'EBikeRide', 'EMountainBikeRide', 'GravelRide', 'MountainBikeRide', 'Velomobile', 'Handcycle']);
export const isRideType = (sportType?: string | null, type?: string | null) =>
  RIDE_TYPES.has(sportType || '') || RIDE_TYPES.has(type || '');

/** Strava sport_type → our category. */
export function categorize(sportType?: string | null, type?: string | null): ActivityCategory {
  const t = sportType || type || '';
  if (isRideType(sportType, type)) return 'ride';
  const map: Record<string, ActivityCategory> = {
    Run: 'run', VirtualRun: 'run', TrailRun: 'trail_run',
    Walk: 'walk', Hike: 'hike', Snowshoe: 'hike',
    Swim: 'swim',
    Rowing: 'row', VirtualRow: 'row',
    Kayaking: 'paddle', Canoeing: 'paddle', StandUpPaddling: 'paddle', Surfing: 'paddle', Kitesurf: 'paddle', Windsurf: 'paddle', Sail: 'paddle',
    NordicSki: 'nordic_ski', BackcountrySki: 'nordic_ski', RollerSki: 'nordic_ski',
    AlpineSki: 'alpine_ski', Snowboard: 'alpine_ski',
    WeightTraining: 'strength', Crossfit: 'strength', HighIntensityIntervalTraining: 'strength', Workout: 'strength', StairStepper: 'strength',
    Yoga: 'mobility', Pilates: 'mobility',
    Soccer: 'team_sport', Basketball: 'team_sport', Volleyball: 'team_sport', Hockey: 'team_sport', Rugby: 'team_sport',
    Tennis: 'racket', Pickleball: 'racket', Badminton: 'racket', Squash: 'racket', TableTennis: 'racket', Racquetball: 'racket', Padel: 'racket',
    RockClimbing: 'climb',
    IceSkate: 'skate', InlineSkate: 'skate', Skateboard: 'skate',
    Elliptical: 'run',
  };
  return map[t] || 'other';
}

export interface LoadInput {
  sportType?: string | null;
  type?: string | null;
  movingTimeSeconds?: number | null;
  averageHeartrate?: number | null;
  /** Athlete physiology (any may be missing). */
  maxHr?: number | null;
  restingHr?: number | null;
  age?: number | null;
}

export interface ActivityLoad {
  category: ActivityCategory;
  method: 'hr' | 'duration';
  intensityFactor: number;
  estTss: number;
  fitnessLoad: number;
  fatigueLoad: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function estimateActivityLoad(input: LoadInput): ActivityLoad {
  const category = categorize(input.sportType, input.type);
  const p = CATEGORY_PROFILES[category];
  const hours = Math.max(0, (input.movingTimeSeconds || 0) / 3600);

  let method: 'hr' | 'duration' = 'duration';
  let IF = p.defaultIF;
  if (input.averageHeartrate && input.averageHeartrate > 40) {
    const maxHr = input.maxHr || (input.age ? Math.round(208 - 0.7 * input.age) : 190);
    const rest = input.restingHr || 60;
    const lthr = rest + 0.85 * (maxHr - rest); // threshold ≈ 85% of HR reserve
    if (lthr > rest) {
      IF = (input.averageHeartrate - rest) / (lthr - rest);
      method = 'hr';
    }
  }
  IF = Math.min(1.15, Math.max(p.minIF ?? 0.3, IF));
  const estTss = hours * IF * IF * 100;
  return {
    category,
    method,
    intensityFactor: Math.round(IF * 100) / 100,
    estTss: r1(estTss),
    fitnessLoad: r1(estTss * p.fitnessTransfer),
    fatigueLoad: r1(estTss * p.fatigueWeight),
  };
}

/**
 * Daily fitness/fatigue inputs from rides (power or HR TSS, counted 1:1) plus
 * cross-training (fitness_load → CTL, fatigue_load → ATL). Day = UTC date of
 * start, matching the existing load calculations.
 */
export function buildDailyLoad(
  rides: { start_date: string; tss: number | null }[],
  other: { start_date: string; fitness_load: number | null; fatigue_load: number | null }[]
): Map<string, { fitness: number; fatigue: number }> {
  const days = new Map<string, { fitness: number; fatigue: number }>();
  const add = (iso: string, fit: number, fat: number) => {
    const k = new Date(iso).toISOString().split('T')[0];
    const d = days.get(k) || { fitness: 0, fatigue: 0 };
    d.fitness += fit; d.fatigue += fat;
    days.set(k, d);
  };
  for (const r of rides) if (r.tss != null) add(r.start_date, Number(r.tss), Number(r.tss));
  for (const o of other) add(o.start_date, Number(o.fitness_load) || 0, Number(o.fatigue_load) || 0);
  return days;
}
