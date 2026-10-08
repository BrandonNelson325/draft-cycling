import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../utils/supabase';
import { workoutService } from './workoutService';
import { calendarService } from './calendarService';
import { athletePreferencesService } from './athletePreferencesService';
import { logger } from '../utils/logger';
import { mapWithConcurrency } from '../utils/concurrency';
import { Level, LEVEL_PROFILES, resolveLevel, recoveryRideAllowance, fuelingNote, Limiter, analyzePowerProfile, eventRelevantLimiter } from '../utils/coachingLevels';
import { isFtpTestWorkout } from '../utils/ftpTest';
import { powerAnalysisService } from './powerAnalysisService';
import {
  TrainingPlanConfig,
  TrainingPlan,
  TrainingWeek,
  WorkoutTemplate,
  PhaseDurations,
  TrainingPhase,
  FitnessLevel,
  DayName,
} from '../types/trainingPlan';

const DAY_NAMES: DayName[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Parse a YYYY-MM-DD plan date at local noon to avoid UTC/DST off-by-one shifts.
 */
export function parsePlanDate(iso: string): Date {
  return new Date(iso + 'T12:00:00');
}

/**
 * The next Monday strictly after `todayIso` (so a plan always starts on a clean
 * future week boundary, never mid-week or in the past).
 */
export function nextMondayIso(todayIso: string): string {
  const d = parsePlanDate(todayIso);
  const day = d.getDay(); // 0=Sun..6=Sat
  const daysUntilMonday = ((8 - day) % 7) || 7; // always 1-7, never 0 (next Monday, not today)
  d.setDate(d.getDate() + daysUntilMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * The actual calendar date for a plan workout. Weeks are anchored to the SUNDAY
 * of the start week, so day_of_week (0=Sun..6=Sat) maps to the real weekday —
 * NOT a raw offset from start_date (which only worked if start was a Sunday).
 */
export function workoutDateFor(startIso: string, weekNumber: number, dayOfWeek: number): Date {
  const start = parsePlanDate(startIso);
  const anchorSunday = new Date(start);
  anchorSunday.setDate(anchorSunday.getDate() - anchorSunday.getDay()); // back up to Sunday
  const d = new Date(anchorSunday);
  d.setDate(d.getDate() + (weekNumber - 1) * 7 + dayOfWeek);
  return d;
}

/**
 * Convert a per-day-hours map into the list of trainable days, sorted by
 * available time (most first). Days with no/zero hours are rest days and are
 * excluded. Deterministic tie-break by day number.
 */
export function availableDaysFromDailyHours(
  daily: Partial<Record<DayName, number>>
): { day: number; cap: number }[] {
  const out: { day: number; cap: number }[] = [];
  DAY_NAMES.forEach((name, idx) => {
    const cap = daily[name];
    if (typeof cap === 'number' && cap > 0) out.push({ day: idx, cap });
  });
  out.sort((a, b) => b.cap - a.cap || a.day - b.day);
  return out;
}

/**
 * Scale a workout's intervals proportionally so the ride actually lasts
 * `durationMinutes` (keeps warmup/work/cooldown ratios intact).
 */
function scaleWorkoutToDuration(workout: WorkoutTemplate, durationMinutes: number): WorkoutTemplate {
  const intervals = workout.intervals || [];
  const totalSec = intervals.reduce((s: number, iv: any) => s + (iv.duration || 0), 0);
  const targetSec = durationMinutes * 60;
  if (totalSec > 0 && targetSec > 0) {
    const scale = targetSec / totalSec;
    const scaled = intervals.map((iv: any) => ({
      ...iv,
      duration: Math.max(30, Math.round((iv.duration || 0) * scale)),
    }));
    return { ...workout, duration_minutes: durationMinutes, intervals: scaled };
  }
  return { ...workout, duration_minutes: durationMinutes };
}

/** Representative intensity factor per workout type, for TSS estimation. */
function intensityFactorFor(type: string): number {
  switch (type) {
    case 'recovery': return 0.55;
    case 'endurance': return 0.70;
    case 'long': return 0.70;
    case 'tempo': return 0.82;
    case 'sweet_spot': return 0.90;
    case 'threshold': return 0.93;
    case 'vo2max': return 1.06;
    case 'anaerobic': return 1.15;
    case 'sprint': return 0.78; // a few seconds of max effort inside an aerobic ride
    default: return 0.75;
  }
}

/**
 * Summarize an interval list's WORK structure the way an athlete reads it:
 * "3 × 8 min @ 93%". Derived from the actual intervals so it can NEVER disagree
 * with what the workout graphic draws. Returns null for steady rides (one work
 * block, e.g. endurance/recovery) where a rep count would be meaningless.
 */
export function describeIntervals(intervals: any[]): string | null {
  if (!Array.isArray(intervals)) return null;
  // Race-specific formats (over-unders, 30/30s, surges, late sets) carry their
  // own label — counting their segments would just say "18 intervals".
  const labeled = intervals.find((iv) => iv?.type === 'work' && typeof iv.label === 'string');
  if (labeled) return labeled.label;
  // Expand repeat counts the same way the visualizer does, so the label matches.
  const work: { duration: number; power: number }[] = [];
  for (const iv of intervals) {
    if (iv?.type !== 'work') continue;
    if (iv.endurance) continue; // post-set Z2 fill — aerobic volume, not a rep
    const count = Math.max(1, Number(iv.repeat) || 1);
    const power = Number(iv.power ?? iv.power_high ?? iv.power_low) || 0;
    for (let i = 0; i < count; i++) work.push({ duration: Number(iv.duration) || 0, power });
  }
  if (work.length <= 1) return null; // steady ride — no meaningful rep structure

  // If every work rep is the same length, express it as "N × M min @ P%".
  const first = work[0];
  const allSame = work.every((w) => w.duration === first.duration);
  const fmt = (sec: number) => (sec < 60 ? `${sec} sec` : `${Math.round(sec / 60)} min`);
  if (allSame) {
    const label = `${work.length} × ${fmt(first.duration)}`;
    return first.power > 0 ? `${label} @ ${first.power}%` : label;
  }
  return `${work.length} intervals`; // mixed structure (e.g. over-unders)
}

/**
 * Build a structured interval list that sums EXACTLY to durationMinutes. Warmup
 * + work + cooldown; for interval types the work portion is broken into
 * work/recovery repeats (so a "threshold" ride isn't one impossible 90-min
 * block). The remainder is always absorbed as easy spinning so totals are exact.
 */
// Per-type interval shape. Code OWNS the powers (never the model) so intensity
// is always physiologically correct; the coach may only choose rep count / work
// & rest length (see buildIntervalsFromStructure). Default work/rest lengths are
// used when the coach doesn't specify a structure.
// Time left over after an interval set is ridden as Z2 endurance, not at the
// between-rep recovery power. 68% FTP = low/mid Z2 — a touch under a steady
// endurance ride (70%) since the legs are pre-fatigued from the intervals.
// Remainders shorter than 10 min aren't a real aerobic block; they stay easy spin.
const ENDURANCE_FILL_POWER = 68;
const ENDURANCE_FILL_MIN_SEC = 600;

// Session SIZE is level-dependent and lives in utils/coachingLevels.ts
// (defaultReps / maxWorkMinutes). Before, a default session filled the WHOLE
// time box with reps — a 2-hour anaerobic day became "26 × 40 sec @ 130%".

/** Efforts that progress by getting LONGER (vs. short efforts that add reps). */
const LONG_EFFORT_TYPES = new Set(['threshold', 'sweet_spot', 'tempo']);

const INTERVAL_SPECS: Record<string, { workPower: number; restPower: number; workSec: number; restSec: number }> = {
  threshold:  { workPower: 93,  restPower: 60, workSec: 480, restSec: 180 }, // 8-min threshold reps
  sweet_spot: { workPower: 90,  restPower: 60, workSec: 720, restSec: 240 }, // 12-min sweet-spot blocks
  vo2max:     { workPower: 110, restPower: 55, workSec: 180, restSec: 120 }, // 3-min VO2 reps
  // Anaerobic capacity: 30s at the top of Z6 (was 40s @ 130% — too soft to be
  // anaerobic work, closer to a hard VO2 effort).
  anaerobic:  { workPower: 150, restPower: 50, workSec: 30,  restSec: 270 }, // 30s @ 150%
  // Neuromuscular sprints: short, MAXIMAL, full recovery. The target is a floor
  // — the cue is "all-out". Previously 'sprint' had no spec and silently became
  // a steady 70% endurance ride named "Endurance Ride".
  sprint:     { workPower: 200, restPower: 50, workSec: 15,  restSec: 285 }, // 15s max sprints
  tempo:      { workPower: 82,  restPower: 62, workSec: 900, restSec: 180 }, // 15-min tempo blocks
};

/**
 * Assemble warmup + work/rest reps + cooldown that sum EXACTLY to `total` sec.
 * `maxReps` caps the number of reps (undefined = fill all available time, the
 * generic behavior); any time not consumed by reps is absorbed as easy spinning.
 * Returns the interval array and how many work reps were actually placed.
 */
function assembleIntervals(
  type: string,
  total: number,
  workLen: number,
  restLen: number,
  workPower: number,
  restPower: number,
  maxReps?: number
): { intervals: any[]; reps: number } {
  const warm = Math.min(600, Math.round(total * 0.15));
  const cool = Math.min(300, Math.round(total * 0.1));
  const available = total - warm - cool;
  if (available < 60) return { intervals: [{ duration: total, power: 58, type: 'work' }], reps: 0 };

  const out: any[] = [{ duration: warm, power: 60, type: 'warmup' }];
  let remaining = available;
  let reps = 0;
  while (remaining >= workLen + restLen && (maxReps == null || reps < maxReps)) {
    // Sprints are MAX efforts: `open` tells exporters not to lock power (ERG
    // would cap a sprint at the target). The power stays as a floor/guide.
    out.push(type === 'sprint'
      ? { duration: workLen, power: workPower, type: 'work', open: true }
      : { duration: workLen, power: workPower, type: 'work' });
    out.push({ duration: restLen, power: restPower, type: 'rest' });
    remaining -= workLen + restLen;
    reps++;
  }
  if (remaining > 0) {
    // Leftover time after the reps. It used to be filled at `restPower` — the
    // BETWEEN-REP recovery power (50–62% FTP). That's right for 2–4 min between
    // VO2 reps, but stretched across the rest of a 2-hour day it meant ~an hour
    // of Z1 (e.g. 5 × 3 min VO2 then 70 min at 55%) — junk volume an advanced
    // rider called out. A real block of leftover time is aerobic work, so ride
    // it as Z2 endurance. Short remainders stay easy spin.
    if (remaining >= ENDURANCE_FILL_MIN_SEC) {
      // type 'work' so every exporter (ZWO/FIT/Wahoo) renders it as a normal
      // steady block at Z2; `endurance: true` tells describeIntervals and the
      // visualizer caption NOT to count it as a rep ("5 × 3 min", not "6 intervals").
      out.push({ duration: remaining, power: ENDURANCE_FILL_POWER, type: 'work', endurance: true });
    } else {
      out.push({ duration: remaining, power: restPower, type: 'rest' });
    }
  }
  out.push({ duration: cool, power: 55, type: 'cooldown' });
  return { intervals: out, reps };
}

export function buildIntervalsForType(
  type: string,
  durationMinutes: number,
  level: Level = 'intermediate',
  progressionStep = 0 // week within a loading block: +1 rep per step, capped by the level's work ceiling
): any[] {
  const total = durationMinutes * 60;
  const spec = INTERVAL_SPECS[type];
  if (!spec) {
    // Steady rides (endurance / recovery / anything else): one work block.
    const warm = Math.min(600, Math.round(total * 0.15));
    const cool = Math.min(300, Math.round(total * 0.1));
    const workSec = total - warm - cool;
    if (workSec < 60) return [{ duration: total, power: 58, type: 'work' }];
    return [
      { duration: warm, power: 60, type: 'warmup' },
      { duration: workSec, power: type === 'recovery' ? 55 : 70, type: 'work' },
      { duration: cool, power: 55, type: 'cooldown' },
    ];
  }
  // Interval type, no explicit structure → a sensible default session (capped
  // reps); the remaining time is ridden as Z2 endurance by assembleIntervals.
  // Progressive overload inside a block, the way coaches do it: LONG efforts
  // get longer (2×8 → 2×10 → 2×12 threshold), SHORT efforts get more reps
  // (5×3 → 6×3 → 7×3 VO2). Never past the level's ceiling on total work time.
  const profile = LEVEL_PROFILES[level];
  const step = Math.max(0, progressionStep);
  const maxWorkSec = (profile.maxWorkMinutes[type] ?? Infinity) * 60;
  let reps = profile.defaultReps[type] ?? 3;
  let workSec = spec.workSec;
  if (LONG_EFFORT_TYPES.has(type)) {
    workSec = Math.round((spec.workSec * (1 + 0.25 * step)) / 30) * 30;
    if (reps * workSec > maxWorkSec) workSec = Math.max(spec.workSec, Math.floor(maxWorkSec / reps / 30) * 30);
  } else {
    reps += step;
  }
  if (reps * workSec > maxWorkSec) reps = Math.max(1, Math.floor(maxWorkSec / workSec));
  return assembleIntervals(
    type, total, workSec, spec.restSec, spec.workPower, spec.restPower, reps
  ).intervals;
}

/**
 * Build intervals from a coach-prescribed STRUCTURE (reps × work_minutes, with
 * rest_minutes recovery). Powers still come from the type (code-owned). Honors
 * the exact rep count when it fits the duration; clamps reps that don't fit.
 * Returns null when the structure is invalid or doesn't apply (steady types, or
 * not even one rep fits) so the caller falls back to buildIntervalsForType.
 */
export type SessionFormat = 'standard' | 'over_under' | 'micro' | 'surges' | 'late';
export const SESSION_FORMATS: SessionFormat[] = ['standard', 'over_under', 'micro', 'surges', 'late'];

/** Which formats make physiological sense for which types. */
const FORMAT_TYPES: Record<Exclude<SessionFormat, 'standard'>, Set<string>> = {
  over_under: new Set(['threshold', 'sweet_spot']),
  micro: new Set(['vo2max']),
  surges: new Set(['tempo', 'sweet_spot', 'threshold']),
  late: new Set(['sprint', 'anaerobic', 'vo2max', 'threshold']),
};

/**
 * Race-specific session formats — what wins races beyond steady reps:
 *  - over_under: threshold reps alternating 2′ under / 1′ over (clearing lactate
 *    while still on the gas — how racing actually feels)
 *  - micro: VO2 sets of 30/30s (lots of VO2 time with repeated surges — crits)
 *  - surges: sustained tempo/SS/threshold with a 15s kick every 2 min
 *    (road race / crit simulation)
 *  - late: the set goes at the END of the ride, after the aerobic block
 *    (sprinting / attacking on tired legs — stage and road race finales)
 * Code owns the physiology; total work is clamped to the level's ceiling.
 * Returns null when the format doesn't apply or nothing fits.
 */
export function buildFormattedIntervals(
  type: string,
  durationMinutes: number,
  s: { reps?: number; work_minutes?: number; rest_minutes?: number; format?: string },
  level: Level = 'intermediate'
): any[] | null {
  const format = s.format as SessionFormat;
  if (!format || format === 'standard' || !FORMAT_TYPES[format as Exclude<SessionFormat, 'standard'>]?.has(type)) return null;
  const spec = INTERVAL_SPECS[type];
  if (!spec) return null;
  const profile = LEVEL_PROFILES[level];

  let reps = Math.round(Number(s.reps)) || profile.defaultReps[type] || 3;
  reps = Math.max(1, Math.min(reps, 24));
  const restSec = Number.isFinite(Number(s.rest_minutes)) && Number(s.rest_minutes) >= 0
    ? Math.min(1800, Math.round(Number(s.rest_minutes) * 60)) : spec.restSec;
  let repSec = Math.round((Number(s.work_minutes) || spec.workSec / 60) * 60);

  // One rep's segments + how much of it counts as hard work.
  let segs: any[] = [];
  let workPerRep = 0;
  let label = '';
  const pct = (p: number) => `${p}%`;
  if (format === 'over_under') {
    const [under, over] = type === 'threshold' ? [95, 108] : [88, 100];
    repSec = Math.max(360, Math.round(repSec / 180) * 180);
    for (let t = 0; t < repSec; t += 180) {
      segs.push({ duration: 120, power: under, type: 'work' }, { duration: 60, power: over, type: 'work' });
    }
    workPerRep = repSec;
    label = `{reps} × ${repSec / 60} min over-unders (${under}/${over}%)`;
  } else if (format === 'micro') {
    repSec = Math.max(300, Math.round(repSec / 60) * 60);
    for (let t = 0; t < repSec; t += 60) {
      segs.push({ duration: 30, power: 120, type: 'work' }, { duration: 30, power: 50, type: 'rest' });
    }
    workPerRep = repSec / 2;
    label = `{reps} × ${repSec / 60} min of 30/30s @ 120%`;
  } else if (format === 'surges') {
    repSec = Math.max(360, Math.round(repSec / 120) * 120);
    for (let t = 0; t < repSec; t += 120) {
      segs.push({ duration: 105, power: spec.workPower, type: 'work' }, { duration: 15, power: 150, type: 'work' });
    }
    workPerRep = repSec;
    label = `{reps} × ${repSec / 60} min @ ${pct(spec.workPower)} w/ 15s surges`;
  } else if (format === 'late') {
    repSec = Math.max(8, repSec);
    segs = [type === 'sprint'
      ? { duration: repSec, power: spec.workPower, type: 'work', open: true }
      : { duration: repSec, power: spec.workPower, type: 'work' }];
    workPerRep = repSec;
    const len = repSec < 60 ? `${repSec} sec` : `${Math.round(repSec / 60)} min`;
    label = `{reps} × ${len} @ ${pct(spec.workPower)} at the end of the ride`;
  }

  const maxWorkSec = (profile.maxWorkMinutes[type] ?? Infinity) * 60;
  if (reps * workPerRep > maxWorkSec) reps = Math.max(1, Math.floor(maxWorkSec / workPerRep));

  const total = durationMinutes * 60;
  const warm = Math.min(600, Math.round(total * 0.15));
  const cool = Math.min(300, Math.round(total * 0.1));
  const available = total - warm - cool;
  while (reps > 0 && reps * (repSec + restSec) > available) reps--;
  if (reps < 1) return null;

  const finalLabel = label.replace('{reps}', String(reps));
  const set: any[] = [];
  for (let r = 0; r < reps; r++) {
    set.push(...segs.map((x) => ({ ...x, label: finalLabel })));
    set.push({ duration: restSec, power: spec.restPower, type: 'rest' });
  }
  const remaining = available - reps * (repSec + restSec);
  const fill = remaining >= ENDURANCE_FILL_MIN_SEC
    ? [{ duration: remaining, power: ENDURANCE_FILL_POWER, type: 'work', endurance: true }]
    : remaining > 0 ? [{ duration: remaining, power: spec.restPower, type: 'rest' }] : [];

  return [
    { duration: warm, power: 60, type: 'warmup' },
    ...(format === 'late' ? [...fill, ...set] : [...set, ...fill]),
    { duration: cool, power: 55, type: 'cooldown' },
  ];
}

export function buildIntervalsFromStructure(
  type: string,
  durationMinutes: number,
  s: { reps?: number; work_minutes?: number; rest_minutes?: number },
  level: Level = 'intermediate'
): any[] | null {
  const spec = INTERVAL_SPECS[type];
  if (!spec) return null; // steady ride — no rep structure

  let reps = Math.round(Number(s.reps));
  const workSec = Math.round(Number(s.work_minutes) * 60);
  if (!Number.isFinite(reps) || reps < 1 || reps > 24) return null;
  if (!Number.isFinite(workSec) || workSec < 8 || workSec > 3600) return null; // ≥8s so 10–15s sprints are valid

  // Code owns physiology: clamp the prescribed structure to this training
  // age's ceiling on total work time (e.g. a beginner can't be given 8×4 VO2
  // even if the model asks). Work-time based, so it's fair to any rep length.
  const maxWorkSec = (LEVEL_PROFILES[level].maxWorkMinutes[type] ?? Infinity) * 60;
  if (reps * workSec > maxWorkSec) reps = Math.max(1, Math.floor(maxWorkSec / workSec));

  let restSec = Math.round(Number(s.rest_minutes) * 60);
  if (!Number.isFinite(restSec) || restSec < 0) restSec = spec.restSec;
  restSec = Math.min(restSec, 1800);

  const { intervals, reps: placed } = assembleIntervals(
    type, durationMinutes * 60, workSec, restSec, spec.workPower, spec.restPower, reps
  );
  if (placed < 1) return null; // couldn't fit even one rep → let generic builder handle it
  return intervals;
}

// Values the `workouts` table CHECK constraint allows. sweet_spot and anaerobic
// are first-class (added in migration 036). `long` is a duration concept, not a
// stored type, so it maps to endurance. Any unexpected value falls back to
// 'custom' so an unknown type can never break the insert (defense in depth).
const DB_WORKOUT_TYPES = new Set([
  'endurance', 'tempo', 'threshold', 'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'recovery', 'custom',
]);
function toDbWorkoutType(type: string): string {
  if (DB_WORKOUT_TYPES.has(type)) return type;
  if (type === 'long') return 'endurance';
  return 'custom';
}

const TYPE_LABELS: Record<string, { name: string; description: string }> = {
  long: { name: 'Long Endurance Ride', description: 'Extended aerobic Zone 2 — your biggest day' },
  endurance: { name: 'Endurance Ride', description: 'Steady aerobic Zone 2 to build volume' },
  recovery: { name: 'Recovery Spin', description: 'Very easy spin to promote recovery' },
  tempo: { name: 'Tempo Ride', description: 'Sustained Zone 3 tempo blocks' },
  sweet_spot: { name: 'Sweet Spot Intervals', description: 'Sustained 88-94% FTP blocks — high return for the fatigue' },
  threshold: { name: 'Threshold Intervals', description: 'Sub/at-threshold intervals to lift FTP' },
  vo2max: { name: 'VO2max Intervals', description: 'High-intensity 3-min VO2max efforts' },
  anaerobic: { name: 'Anaerobic Bursts', description: 'Short, very hard efforts above VO2max' },
  sprint: { name: 'Sprint Efforts', description: 'All-out maximal sprints with full recovery — the target is a minimum, go max' },
};

/** Build one workout of a given type, sized to durationMinutes, on a given day. */
function buildWorkout(type: string, durationMinutes: number, dayOfWeek: number, rationale?: string, level: Level = 'intermediate', progressionStep = 0): WorkoutTemplate {
  const label = TYPE_LABELS[type] || TYPE_LABELS.endurance;
  const intervals = buildIntervalsForType(type, durationMinutes, level, progressionStep);
  // Name from the ACTUAL synthesized structure so the title always matches the
  // interval graphic (e.g. "Threshold Intervals · 3 × 8 min @ 93%").
  const structure = describeIntervals(intervals);
  return {
    name: structure ? `${label.name} · ${structure}` : label.name,
    description: label.description,
    workout_type: toDbWorkoutType(type),
    duration_minutes: durationMinutes,
    day_of_week: dayOfWeek,
    intervals,
    rationale,
  };
}

/**
 * Build a workout from an AI-designed spec: the AI chooses type/duration/day/
 * name/rationale (the coaching decisions); we synthesize the intervals so they
 * are always valid and sum correctly. Used by aiPlanDesignerService.
 */
export function buildWorkoutFromSpec(spec: {
  workout_type: string;
  duration_minutes: number;
  day_of_week: number;
  name?: string;
  rationale?: string;
  // Coach-prescribed interval structure (optional). When present + valid, the
  // session is built to match (e.g. reps 2, work_minutes 12 → a real 2×12);
  // otherwise we fall back to the generic per-type template.
  reps?: number;
  work_minutes?: number;
  rest_minutes?: number;
  format?: string; // race-specific session format (see buildFormattedIntervals)
}, level: Level = 'intermediate'): WorkoutTemplate {
  const fallback = TYPE_LABELS[spec.workout_type] || TYPE_LABELS.endurance;
  const formatted = spec.format
    ? buildFormattedIntervals(spec.workout_type, spec.duration_minutes, spec, level)
    : null;
  const structured = formatted ??
    (spec.reps != null || spec.work_minutes != null
      ? buildIntervalsFromStructure(spec.workout_type, spec.duration_minutes, {
          reps: spec.reps,
          work_minutes: spec.work_minutes,
          rest_minutes: spec.rest_minutes,
        }, level)
      : null);
  const intervals = structured ?? buildIntervalsForType(spec.workout_type, spec.duration_minutes, level);
  // We synthesize the intervals, so the NAME must describe the structure we
  // actually built — never the model's claimed structure (which could say
  // "2×12" while the builder produced 3×8). Base label reflects the true type
  // (e.g. sweet_spot → "Sweet Spot Intervals"); structure is appended from the
  // real intervals so name + graphic can't disagree.
  const structure = describeIntervals(intervals);
  return {
    name: structure ? `${fallback.name} · ${structure}` : fallback.name,
    description: spec.rationale || fallback.description,
    // Store a DB-allowed type, but build intervals from the original type
    // (e.g. sweet_spot → 'threshold' row with sweet-spot-shaped intervals).
    workout_type: toDbWorkoutType(spec.workout_type),
    duration_minutes: spec.duration_minutes,
    day_of_week: spec.day_of_week,
    intervals,
    rationale: spec.rationale,
  };
}

const VALID_WORKOUT_TYPES = new Set([
  'recovery', 'endurance', 'long', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic', 'sprint',
]);

/**
 * Normalize an AI-designed plan into a safe, schedulable TrainingPlan, ENFORCING
 * the same invariants the deterministic generator guarantees — regardless of
 * what the model returned:
 *   - only days the athlete is actually available (cap > 0) are kept
 *   - no workout exceeds that day's available time (clamped, not trusted)
 *   - one workout per day (dedup), valid workout types, sane durations
 *   - intervals are synthesized by us (never trust model-authored intervals)
 * Throws if the result is empty/unusable so the caller can fall back to the
 * deterministic engine.
 */
const QUALITY_WORKOUT_TYPES = new Set(['threshold', 'sweet_spot', 'vo2max', 'anaerobic', 'tempo', 'sprint']);
const isQualityWorkout = (w: WorkoutTemplate) => QUALITY_WORKOUT_TYPES.has(w.workout_type) || isFtpTestWorkout(w);

export { isFtpTestWorkout };

/**
 * The 20-minute FTP test. FTP = 95% of the 20-min average. The 20-min block is
 * `open` (exported as free ride / open target — ERG must never cap a test) and
 * carries a ~100% pacing guide. Non-beginners do a 5-min hard effort first to
 * take the edge off anaerobic capacity (classic Coggan/Allen protocol);
 * beginners skip it — it mostly ruins their pacing.
 */
export function buildFtpTestWorkout(dayOfWeek: number, level: Level = 'intermediate'): WorkoutTemplate {
  const intervals: any[] = [
    { duration: 600, power: 60, type: 'warmup' },
  ];
  for (let i = 0; i < 3; i++) {
    intervals.push({ duration: 60, power: 100, type: 'work' });
    intervals.push({ duration: 60, power: 55, type: 'rest' });
  }
  intervals.push({ duration: 300, power: 60, type: 'rest' });
  if (level !== 'beginner') {
    intervals.push({ duration: 300, power: 105, type: 'work' });
    intervals.push({ duration: 600, power: 55, type: 'rest' });
  }
  intervals.push({ duration: 1200, power: 100, type: 'work', open: true, ftp_test: true });
  intervals.push({ duration: 600, power: 50, type: 'cooldown' });
  const duration = Math.round(intervals.reduce((s, iv) => s + iv.duration, 0) / 60);
  return {
    name: 'FTP Test · 20 min',
    description:
      'Your best sustainable 20 minutes — FTP is set to 95% of the average. Start at the guide (≈ current FTP), ' +
      'hold steady, and only push harder in the final 5 minutes. Ride it fresh, ideally indoors or on a steady road.',
    workout_type: 'custom',
    duration_minutes: duration,
    day_of_week: dayOfWeek,
    intervals,
    rationale: 'FTP test at the start of the block — re-sets every training zone so the next block keeps pushing you as you get stronger.',
  };
}

/**
 * Put FTP tests into a plan: week 1 (baseline) and the first loading week after
 * each recovery week (fresh legs → accurate result, and the new FTP drives the
 * whole next block). Base/build only, ≥4 weeks apart. In the chosen week the
 * test replaces a quality session, on a day with room for it whose previous day
 * isn't the long ride or another quality session. Mutates `weeks`.
 */
/** Append level-scaled fueling guidance to every session long enough to need it. Mutates. */
export function addFuelingGuidance(weeks: TrainingWeek[], level: Level = 'intermediate'): void {
  for (const w of weeks) for (const x of w.workouts) {
    const note = fuelingNote(x.duration_minutes, isQualityWorkout(x), level);
    if (note && !x.description.includes('Fuel:')) x.description = `${x.description} ${note}`.trim();
  }
}

export function scheduleFtpTests(
  weeks: TrainingWeek[],
  capByDay: Map<number, number>,
  level: Level = 'intermediate'
): void {
  const mins = weeks.map((w) => w.workouts.reduce((s, x) => s + x.duration_minutes, 0));
  const isRecovery = weeks.map((w, i) => {
    const prev = mins.slice(Math.max(0, i - 3), i);
    return /recovery/i.test(w.notes || '') || (prev.length > 0 && mins[i] < 0.8 * Math.max(...prev));
  });
  const test = buildFtpTestWorkout(0, level);
  let lastTestWeek = -99;

  weeks.forEach((w, i) => {
    if (w.phase !== 'base' && w.phase !== 'build') return;
    if (isRecovery[i]) return;
    const blockStart = i === 0 || isRecovery[i - 1];
    if (!blockStart || i - lastTestWeek < 4) return;

    // THE long ride = the longest non-quality ride (quality days can be just
    // as long — a duration tie used to exclude every quality day as a "long ride").
    const easy = w.workouts.filter((x) => !isQualityWorkout(x));
    const longRide = easy.length ? easy.reduce((a, b) => (b.duration_minutes > a.duration_minutes ? b : a)) : null;
    const byDay = new Map(w.workouts.map((x) => [x.day_of_week, x]));
    const hardBefore = (day: number) => {
      const prev = byDay.get((day + 6) % 7);
      return !!prev && (isQualityWorkout(prev) || prev === longRide);
    };
    // Turning an easy day into a test must not create a quality run longer
    // than the level allows.
    const qualityDays = w.workouts.filter(isQualityWorkout).map((x) => x.day_of_week);
    const atCap = qualityDays.length >= LEVEL_PROFILES[level].qualityPerWeek[1];
    const stackOk = (x: WorkoutTemplate) =>
      isQualityWorkout(x) ||
      (!atCap && longestWeekRun([...qualityDays, x.day_of_week]) <= LEVEL_PROFILES[level].maxStackedQuality);
    const fits = (x: WorkoutTemplate) => ((capByDay.get(x.day_of_week) || 0) * 60) >= test.duration_minutes;
    const candidates = w.workouts.filter((x) => fits(x) && x !== longRide && stackOk(x));
    const pick =
      candidates.find((x) => isQualityWorkout(x) && !hardBefore(x.day_of_week)) ||
      candidates.find((x) => isQualityWorkout(x)) ||
      candidates.find((x) => !hardBefore(x.day_of_week));
    if (!pick) return;

    w.workouts = w.workouts.map((x) => (x === pick ? buildFtpTestWorkout(pick.day_of_week, level) : x));
    w.tss = weekTss(w.workouts);
    lastTestWeek = i;
  });
}

const weekTss = (workouts: WorkoutTemplate[]) => Math.round(
  workouts.reduce((s, x) => {
    const IF = intensityFactorFor(x.workout_type);
    return s + (x.duration_minutes / 60) * IF * IF * 100;
  }, 0)
);

/**
 * Hard training-age limits the model is TOLD but doesn't always follow (the
 * plan-quality eval caught Opus giving a beginner 6 riding days and stacking
 * quality across a week boundary). Enforced in code, in place:
 *  1. riding days/week ≤ the level's ceiling — drops recovery rides first,
 *     then the shortest endurance rides; never the long ride or quality.
 *  2. consecutive quality days ≤ maxStackedQuality, checked across week
 *     boundaries (Sat → next Sun) — the later session becomes Z2 endurance.
 */
export function enforceLevelInvariants(weeks: TrainingWeek[], level: Level, intensityPreference?: string | null): void {
  const profile = LEVEL_PROFILES[level];
  const toEndurance = (x: WorkoutTemplate, why: string) =>
    buildWorkout('endurance', x.duration_minutes, x.day_of_week, why, level);
  const mins = weeks.map((w) => w.workouts.reduce((s, x) => s + x.duration_minutes, 0));
  const isRecoveryWeek = (i: number) => {
    const prev = mins.slice(Math.max(0, i - 3), i);
    return prev.length > 0 && mins[i] < 0.8 * Math.max(...prev);
  };

  // 0a. Quality sessions per week ≤ the level's ceiling (taper excepted —
  //     short openers). Extra sessions, latest first, become Z2 endurance.
  weeks.forEach((w) => {
    if (w.phase === 'taper') return;
    const quality = w.workouts.filter(isQualityWorkout).sort((a, b) => a.day_of_week - b.day_of_week);
    const extra = new Set(quality.slice(profile.qualityPerWeek[1]).filter((x) => !isFtpTestWorkout(x)));
    if (extra.size) w.workouts = w.workouts.map((x) => (extra.has(x)
      ? toEndurance(x, 'Steady Z2 endurance — one quality session fewer this week so the others land.') : x));
  });

  // 0b. Z1 recovery rides in a loading week ≤ the level's allowance. Keeps the
  //     ones right after hard work (esp. after a 2+ day block); extras → Z2.
  const allowance = recoveryRideAllowance(level, intensityPreference);
  weeks.forEach((w, i) => {
    if (w.phase === 'taper' || isRecoveryWeek(i)) return;
    const byDay = new Map(w.workouts.map((x) => [x.day_of_week, x]));
    const hard = (d: number) => { const x = byDay.get((d + 7) % 7); return !!x && isQualityWorkout(x); };
    const recs = w.workouts.filter((x) => x.workout_type === 'recovery');
    const afterBlock = (x: WorkoutTemplate) => hard(x.day_of_week - 1) && hard(x.day_of_week - 2);
    const ranked = recs
      .filter((x) => !afterBlock(x))
      .sort((a, b) => Number(hard(b.day_of_week - 1)) - Number(hard(a.day_of_week - 1)));
    const extra = new Set(ranked.slice(allowance));
    if (extra.size) w.workouts = w.workouts.map((x) => (extra.has(x)
      ? toEndurance(x, 'Aerobic Z2 endurance — easy days stay productive; true recovery spins are saved for after the hardest work.') : x));
  });

  for (const w of weeks) {
    const maxDays = profile.ridingDaysPerWeek[1];
    if (w.workouts.length <= maxDays) continue;
    const longest = Math.max(...w.workouts.map((x) => x.duration_minutes));
    const rank = (x: WorkoutTemplate) =>
      x.workout_type === 'recovery' ? 0 : isQualityWorkout(x) ? 2 : 1;
    const droppable = w.workouts
      .filter((x) => !(x.workout_type === 'endurance' && x.duration_minutes === longest))
      .sort((a, b) => rank(a) - rank(b) || a.duration_minutes - b.duration_minutes);
    const drop = new Set(droppable.slice(0, w.workouts.length - maxDays));
    w.workouts = w.workouts.filter((x) => !drop.has(x));
  }

  let prevAbs = -99;
  let run = 0;
  weeks.forEach((w, wi) => {
    w.workouts = w.workouts.map((x) => {
      if (!isQualityWorkout(x)) return x;
      const abs = wi * 7 + x.day_of_week;
      run = abs === prevAbs + 1 ? run + 1 : 1;
      if (run > profile.maxStackedQuality) {
        run = 0;
        return buildWorkout('endurance', x.duration_minutes, x.day_of_week,
          'Steady Z2 endurance — kept aerobic so the quality sessions either side of it land.', level);
      }
      prevAbs = abs;
      return x;
    });
    w.tss = weekTss(w.workouts);
  });
}

export function normalizeAiPlan(
  aiWeeks: any[],
  availableDays: { day: number; cap: number }[],
  meta: { goal_event: string; eventIso: string; startIso: string; athleteId: string; level?: Level; intensityPreference?: string | null }
): TrainingPlan {
  if (!Array.isArray(aiWeeks) || aiWeeks.length === 0) {
    throw new Error('AI plan has no weeks');
  }
  const capByDay = new Map(availableDays.map((d) => [d.day, d.cap]));

  const weeks: TrainingWeek[] = [];
  let weekNum = 1;

  for (const w of aiWeeks) {
    const phase: TrainingPhase = ['base', 'build', 'peak', 'taper'].includes(w?.phase) ? w.phase : 'build';
    const byDay = new Map<number, WorkoutTemplate>();

    for (const wk of Array.isArray(w?.workouts) ? w.workouts : []) {
      const day = Number(wk?.day_of_week);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      const cap = capByDay.get(day);
      if (!cap || cap <= 0) continue; // not an available day — drop it
      if (byDay.has(day)) continue; // one workout per day

      const type = VALID_WORKOUT_TYPES.has(wk?.workout_type) ? wk.workout_type : 'endurance';
      const capMin = Math.floor(cap * 60);
      let dur = Math.round((Number(wk?.duration_minutes) || 60) / 5) * 5;
      if (dur > capMin) dur = Math.floor(capMin / 5) * 5; // clamp to available time
      if (dur < 30) dur = Math.min(30, capMin);

      const numOrUndef = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
      byDay.set(day, buildWorkoutFromSpec({
        workout_type: type,
        duration_minutes: dur,
        day_of_week: day,
        name: typeof wk?.name === 'string' ? wk.name.slice(0, 80) : undefined,
        rationale: typeof wk?.rationale === 'string' ? wk.rationale.slice(0, 300) : undefined,
        // Coach-prescribed structure (validated + clamped inside the builder).
        reps: numOrUndef(wk?.reps),
        work_minutes: numOrUndef(wk?.work_minutes),
        rest_minutes: numOrUndef(wk?.rest_minutes),
        format: typeof wk?.format === 'string' ? wk.format : undefined,
      }, meta.level ?? 'intermediate'));
    }

    const workouts = [...byDay.values()].sort((a, b) => a.day_of_week - b.day_of_week);
    if (workouts.length === 0) continue; // skip empty weeks
    const tss = Math.round(
      workouts.reduce((s, x) => {
        const IF = intensityFactorFor(x.workout_type);
        return s + (x.duration_minutes / 60) * IF * IF * 100;
      }, 0)
    );
    weeks.push({ week_number: weekNum++, phase, tss, workouts, notes: typeof w?.focus === 'string' ? w.focus.slice(0, 120) : undefined });
  }

  if (weeks.length === 0) throw new Error('AI plan had no schedulable workouts after normalization');
  enforceLevelInvariants(weeks, meta.level ?? 'intermediate', meta.intensityPreference);

  return {
    id: uuidv4(),
    athlete_id: meta.athleteId,
    goal_event: meta.goal_event,
    event_date: meta.eventIso,
    start_date: meta.startIso,
    weeks,
    total_tss: weeks.reduce((s, w) => s + w.tss, 0),
    created_at: new Date().toISOString(),
  };
}

export type EventKind = 'stage_race' | 'crit' | 'road_race' | 'time_trial' | 'endurance_event' | 'general';

/** Best-effort event type from the goal text — drives race-specific sessions in the fallback. */
export function detectEventKind(goal: string | null | undefined): EventKind {
  const g = (goal || '').toLowerCase();
  if (/stage race|stage-race|multi-?day|tour of|\d+[- ]day/.test(g)) return 'stage_race';
  if (/crit|criterium|circuit race|kermesse/.test(g)) return 'crit';
  if (/time trial|\btt\b|ttt|hill ?climb/.test(g)) return 'time_trial';
  if (/road race|race|cat \d|category/.test(g)) return 'road_race';
  if (/fondo|century|sportive|gravel|charity|\d+ ?(mi|mile|km)/.test(g)) return 'endurance_event';
  return 'general';
}

/** Days are adjacent within a repeating week (Saturday → next Sunday counts). */
function weekAdjacent(a: number, b: number): boolean {
  const d = Math.abs(a - b);
  return d === 1 || d === 6;
}

/** Longest run of consecutive weekdays in a repeating week (wraps Sat → Sun). */
function longestWeekRun(days: number[]): number {
  const set = new Set(days);
  if (set.size === 7) return 7;
  let best = 0;
  for (const d of set) {
    if (set.has((d + 6) % 7)) continue; // not the start of a run
    let n = 0;
    while (set.has((d + n) % 7)) n++;
    best = Math.max(best, n);
  }
  return best;
}

/**
 * Drop available days down to `maxDays` riding days. The long-ride day (index 0,
 * most time) is always kept. Removes the lowest-time day first; ties go to the
 * day whose removal best breaks up long streaks (prefer the day after the long
 * ride). Input and output are sorted by cap desc.
 */
export function trimRidingDays(
  availableDays: { day: number; cap: number }[],
  maxDays: number
): { day: number; cap: number }[] {
  const kept = [...availableDays];
  if (kept.length === 0) return kept;
  const longDay = kept[0].day;
  while (kept.length > maxDays) {
    const minCap = Math.min(...kept.slice(1).map((d) => d.cap));
    const candidates = kept.slice(1).filter((d) => d.cap === minCap);
    const scored = candidates.map((c) => ({
      c,
      run: longestWeekRun(kept.filter((d) => d !== c).map((d) => d.day)),
      afterLong: c.day === (longDay + 1) % 7 ? 0 : 1,
    }));
    scored.sort((a, b) => a.run - b.run || a.afterLong - b.afterLong);
    kept.splice(kept.indexOf(scored[0].c), 1);
  }
  return kept;
}

/**
 * Re-place a week's workouts onto the athlete's actually-available days and cap
 * each workout at that day's available time. The longest workout (the long
 * ride) goes to the day with the MOST time — never assumes weekends. Workouts
 * beyond the number of available days are dropped. This is the core guarantee
 * that the plan matches the rider's stated per-day availability.
 */
export function applyDailyHourCaps(
  workouts: WorkoutTemplate[],
  availableDays: { day: number; cap: number }[],
  minDuration: number
): WorkoutTemplate[] {
  if (availableDays.length === 0) return [];
  const bySize = [...workouts].sort((a, b) => b.duration_minutes - a.duration_minutes);
  const placed: WorkoutTemplate[] = [];

  for (let i = 0; i < bySize.length && i < availableDays.length; i++) {
    const { day, cap } = availableDays[i];
    const capMin = Math.floor(cap * 60);
    let dur = Math.round(Math.min(bySize[i].duration_minutes, capMin) / 5) * 5;
    if (dur > capMin) dur -= 5; // rounding must never exceed the cap
    const floor = Math.min(minDuration, capMin);
    if (dur < floor) dur = floor;
    placed.push(scaleWorkoutToDuration({ ...bySize[i], day_of_week: day }, dur));
  }

  placed.sort((a, b) => a.day_of_week - b.day_of_week); // stable display order
  return placed;
}

/**
 * Minimum workout duration based on weekly hours target.
 * Athletes committing 8+ hours/week are not beginners — they won't ride < 60 min.
 * Athletes at 4-6 hours/week may accept shorter rides.
 * True beginners (< 4 hours) can have shorter rides.
 */
function getMinDuration(weeklyHours: number): number {
  if (weeklyHours >= 7) return 60;   // Committed riders: 60 min minimum
  if (weeklyHours >= 4) return 45;   // Developing riders: 45 min minimum
  return 30;                          // Beginners: 30 min minimum
}

/**
 * Enforce minimum duration on a workout and scale intervals proportionally.
 */
function enforceMinDuration(workout: WorkoutTemplate, minDuration: number): WorkoutTemplate {
  if (workout.duration_minutes >= minDuration) return workout;
  return { ...workout, duration_minutes: minDuration };
}

/**
 * Scale workout durations so the week's total hours match the target weekly hours.
 * Preserves relative proportions (long ride stays longest, recovery stays shortest).
 */
function scaleToWeeklyHours(workouts: WorkoutTemplate[], targetHours: number, minDuration: number, isRecoveryWeek: boolean, loadingMultiplier: number = 1.0): WorkoutTemplate[] {
  if (workouts.length === 0) return workouts;

  // Recovery weeks: 60-65% of normal volume (easy)
  // Loading weeks: scaled by loadingMultiplier for progressive overload (hard)
  const effectiveTarget = isRecoveryWeek ? targetHours * 0.65 : targetHours * loadingMultiplier;
  const targetMinutes = effectiveTarget * 60;
  const currentTotal = workouts.reduce((sum, w) => sum + w.duration_minutes, 0);

  if (currentTotal === 0) return workouts;

  const scale = targetMinutes / currentTotal;

  return workouts.map(w => {
    const scaled = Math.round(w.duration_minutes * scale);
    // Round to nearest 5 minutes for clean durations
    const rounded = Math.round(Math.max(scaled, minDuration) / 5) * 5;
    return enforceMinDuration({ ...w, duration_minutes: rounded }, minDuration);
  });
}

export const trainingPlanService = {
  /**
   * Generate a complete training plan
   */
  async generatePlan(athleteId: string, config: TrainingPlanConfig): Promise<TrainingPlan> {
    // Get athlete's current FTP. (training_goal lives in `preferences` JSONB,
    // not as a column — selecting it as a column made the whole query return
    // null, which then surfaced as a misleading "Athlete FTP not set" error.)
    const { data: athlete, error: athleteErr } = await supabaseAdmin
      .from('athletes')
      .select('ftp, timezone, experience_level, weight_kg')
      .eq('id', athleteId)
      .single();

    if (athleteErr || !athlete) {
      throw new Error(`Failed to load athlete: ${athleteErr?.message || 'not found'}`);
    }
    if (!athlete.ftp) {
      throw new Error('Athlete FTP not set');
    }

    // Get rest days from athlete preferences
    const preferences = await athletePreferencesService.getPreferences(athleteId);
    const restDays = preferences.rest_days || [];

    // Per-day availability drives everything when provided: derive the weekly
    // hours target from the sum of daily caps so the volume math lines up, then
    // we cap each workout per-day after generation (see applyDailyHourCaps).
    const availableDays = config.daily_hours ? availableDaysFromDailyHours(config.daily_hours) : [];
    if (availableDays.length > 0) {
      const sum = availableDays.reduce((s, d) => s + d.cap, 0);
      if (sum > 0) config.weekly_hours = sum;
    }

    // Calculate weeks until event
    const weeksUntilEvent = this.calculateWeeks(config.event_date);

    if (weeksUntilEvent < 4) {
      throw new Error('Need at least 4 weeks to build a training plan');
    }

    // Determine phase durations
    const phases = this.calculatePhases(weeksUntilEvent);

    // Get current CTL (chronic training load) to base plan off current fitness
    const currentCTL = await this.estimateCurrentCTL(athleteId);

    // Generate week-by-week structure.
    let weeks: TrainingWeek[];
    if (availableDays.length > 0) {
      // PER-DAY PATH (preferred): build each week directly from the athlete's
      // stated per-day availability. Every available day is trained, every
      // week. Volume across weeks (base ramp → recovery dip → taper) is handled
      // by scaling each day's ride as (that day's hours × the week's volume
      // factor) — NOT by dropping days. This is fully dynamic to availability.
      const eventKind = detectEventKind(`${config.goal_event || ''} ${(config as any).route_notes || ''}`);
      let limiter: Limiter | null = null;
      try {
        const prs = await powerAnalysisService.getPersonalRecords(athleteId);
        limiter = eventRelevantLimiter(analyzePowerProfile(prs, athlete.ftp, (athlete as any).weight_kg).limiters, eventKind);
      } catch { /* optional */ }
      weeks = this.generatePerDayWeeks(
        athlete.ftp, phases, availableDays,
        resolveLevel((athlete as any).experience_level),
        (preferences as any).intensity_preference,
        eventKind,
        limiter
      );
      // Real 20-min FTP tests at block starts (unless the athlete opted for
      // estimation only) — without them FTP stalls and the plan stops pushing.
      if ((preferences as any).ftp_test_preference !== 'ai_estimation') {
        scheduleFtpTests(weeks, new Map(availableDays.map((d) => [d.day, d.cap])),
          resolveLevel((athlete as any).experience_level));
      }
      addFuelingGuidance(weeks, resolveLevel((athlete as any).experience_level));
    } else {
      const minDuration = getMinDuration(config.weekly_hours);
      weeks = this.generateWeeklyStructure(athleteId, athlete.ftp, config, phases, currentCTL, restDays);
    }

    const tz = athlete.timezone || 'America/Los_Angeles';
    const todayIso = (() => {
      try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); }
      catch { return new Date().toISOString().split('T')[0]; }
    })();

    // Start date: explicit override wins; per-day plans start the upcoming
    // Monday for clean whole weeks; otherwise today.
    const startDate = config.start_date
      ? config.start_date
      : (availableDays.length > 0 ? nextMondayIso(todayIso) : todayIso);

    // Create plan object
    const plan: TrainingPlan = {
      id: uuidv4(),
      athlete_id: athleteId,
      goal_event: config.goal_event,
      event_date: config.event_date.toISOString().split('T')[0],
      start_date: startDate,
      weeks,
      total_tss: weeks.reduce((sum, week) => sum + week.tss, 0),
      created_at: new Date().toISOString(),
    };

    return plan;
  },

  /**
   * Calculate number of weeks until event
   */
  calculateWeeks(eventDate: Date): number {
    const now = new Date();
    const diffTime = eventDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7);
  },

  /**
   * Calculate phase durations based on total weeks
   */
  calculatePhases(totalWeeks: number): PhaseDurations {
    if (totalWeeks >= 16) {
      // Long plan: more time in base
      return {
        base: Math.floor(totalWeeks * 0.4), // 40% in base
        build: Math.floor(totalWeeks * 0.35), // 35% in build
        peak: Math.floor(totalWeeks * 0.15), // 15% in peak
        taper: Math.max(1, Math.floor(totalWeeks * 0.1)), // 10% taper, min 1 week
      };
    } else if (totalWeeks >= 12) {
      // Medium plan
      return {
        base: Math.floor(totalWeeks * 0.35),
        build: Math.floor(totalWeeks * 0.35),
        peak: Math.floor(totalWeeks * 0.15),
        taper: Math.max(2, Math.floor(totalWeeks * 0.15)), // 2 weeks min for endurance events
      };
    } else if (totalWeeks >= 8) {
      // Short plan
      return {
        base: Math.floor(totalWeeks * 0.25),
        build: Math.floor(totalWeeks * 0.4),
        peak: Math.floor(totalWeeks * 0.15),
        taper: 2, // 2 weeks taper even for short plans
      };
    } else {
      // Very short plan (4-7 weeks)
      return {
        base: Math.floor(totalWeeks * 0.25),
        build: Math.floor(totalWeeks * 0.45),
        peak: Math.floor(totalWeeks * 0.15),
        taper: Math.max(1, Math.min(2, totalWeeks - 3)), // At least 1 week, 2 if room
      };
    }
  },

  /**
   * Per-day deterministic week builder. Trains EVERY day the athlete said they
   * have time, every week — rest comes only from days they didn't give. Volume
   * across the plan (base ramp → recovery dip → peak → taper) is expressed as a
   * per-week "volume factor" applied to each day's available hours, so down
   * weeks are lighter rides on the SAME days, never fewer days.
   *
   *   - The day with the MOST time gets the long ride (never assumes a weekend).
   *   - Intensity sessions (threshold/VO2/tempo) go on the next-biggest days,
   *     capped at 2h (you don't do a 5-hour threshold workout).
   *   - All remaining available days are easy aerobic endurance.
   *   - No ride ever exceeds that day's stated available time.
   */
  generatePerDayWeeks(
    ftp: number,
    phases: PhaseDurations,
    allAvailableDays: { day: number; cap: number }[], // pre-sorted by cap desc
    level: Level = 'intermediate',
    intensityPreference?: string | null,
    eventKind: EventKind = 'general',
    limiter: Limiter | null = null // event-relevant weakness from the power profile
  ): TrainingWeek[] {
    const profile = LEVEL_PROFILES[level];
    // Racers (not beginners) get race-specific formats in build/peak; types are
    // written 'type:format' and split when the workout is built.
    const racer = level !== 'beginner' && ['stage_race', 'road_race', 'crit'].includes(eventKind);
    const buildTypes = !racer ? ['threshold', 'tempo', 'threshold']
      : eventKind === 'crit' ? ['threshold:over_under', 'vo2max:micro', 'tempo']
      : ['threshold:over_under', 'tempo', 'threshold'];
    const peakTypes = !racer ? ['vo2max', 'threshold', 'tempo']
      : eventKind === 'crit' ? ['vo2max:micro', 'sweet_spot:surges', 'sprint']
      : ['vo2max', 'threshold:over_under', 'sprint:late'];
    // Work the event-relevant limiter: it takes the tempo slot in build and the
    // last quality slot in peak (beginners keep the simple progression).
    if (limiter && level !== 'beginner') {
      const sess = limiter === 'vo2max' ? 'vo2max' : limiter;
      const swapIn = (types: string[], fallbackIdx: number) => {
        if (types.some((t) => t.startsWith(sess))) return;
        const i = types.findIndex((t) => t.startsWith('tempo'));
        types[i >= 0 ? i : fallbackIdx] = sess;
      };
      swapIn(buildTypes, 1);
      swapIn(peakTypes, peakTypes.length - 1);
    }
    // Stage races: quality days back-to-back (fatigue resistance) in build/peak.
    const stackQuality = eventKind === 'stage_race' && profile.maxStackedQuality >= 2;
    // Being AVAILABLE every day doesn't mean riding every day — a beginner
    // offered 7 days rides at most 5. Trim to the level's ceiling.
    const availableDays = trimRidingDays(allAvailableDays, profile.ridingDaysPerWeek[1]);
    const recoveryAllowance = recoveryRideAllowance(level, intensityPreference);
    const STRUCTURED_MAX = 120; // minutes — cap on intensity-ride length
    const round5 = (m: number) => Math.round(m / 5) * 5;

    type RideKind = 'long' | 'intensity' | 'easy' | 'recovery';
    const sizeDay = (cap: number, factor: number, kind: RideKind): number => {
      const capMin = cap * 60;
      const target =
        kind === 'long' ? capMin * factor
        : kind === 'intensity' ? Math.min(capMin, STRUCTURED_MAX) * factor
        : kind === 'recovery' ? Math.min(capMin, 60) * factor // recovery is SHORT even on a big day
        : capMin * factor * 0.9;
      let d = round5(target);
      if (d > capMin) d = Math.floor(capMin / 5) * 5;
      const floor = Math.min(30, capMin);
      if (d < floor) d = floor;
      return d;
    };

    const rationaleFor = (kind: RideKind, type: string): string => {
      switch (kind) {
        case 'long': return 'Your day with the most time — long aerobic endurance to build the durability this goal demands.';
        case 'recovery': return 'Deliberate easy recovery the day after hard work — flushes the legs and lets the hard sessions stick.';
        case 'intensity':
          if (type === 'threshold:over_under') return 'Over-unders — holding threshold through surges, the way races are actually ridden.';
          if (type === 'vo2max:micro') return '30/30s — big VO2 time with repeated accelerations, like a crit.';
          if (type === 'sweet_spot:surges') return 'Sustained power with a kick every 2 minutes — race simulation.';
          if (type === 'sprint:late') return 'Sprints at the END of the ride — races are decided on tired legs.';
          if (type === 'sprint') return 'Max sprints on fresh legs to build peak power.';
          return type === 'vo2max' ? 'VO2max intervals to raise your aerobic ceiling.'
            : type === 'threshold' ? 'Threshold work to lift sustainable power (FTP).'
            : 'Tempo to build aerobic strength without deep fatigue.';
        default: return 'Aerobic endurance — adds volume without extra stress.';
      }
    };

    const weeks: TrainingWeek[] = [];
    let weekNumber = 1;

    const pushWeek = (phase: TrainingPhase, factor: number, phaseTypes: string[], notes?: string, isRecoveryWeek = false, step = 0) => {
      // Quality sessions per week scale with training age — a beginner doesn't
      // get the 3 build-phase quality days an advanced rider does.
      const intensityTypes = isRecoveryWeek ? phaseTypes : phaseTypes.slice(0, profile.qualityPerWeek[1]);

      // 1. Assign a role to each available day by time: the biggest day is the
      //    long ride, the next-biggest are the phase's intensity sessions, the
      //    rest start as easy endurance.
      //    Quality days are chosen biggest-first but must respect the level's
      //    spacing: beginners never get quality next to another hard day (incl.
      //    the long ride); others never exceed maxStackedQuality in a row.
      //    Fewer quality sessions beats badly-spaced ones.
      const roleByDay = new Map<number, { type: string; kind: RideKind; cap: number }>();
      const longDay = availableDays[0].day;
      const qualityDays: number[] = [];
      let candidates = availableDays.slice(1);
      if (stackQuality && !isRecoveryWeek && (phase === 'build' || phase === 'peak') && candidates.length > 1) {
        // Pull the best day adjacent to the top quality day up to 2nd place.
        const first = candidates[0].day;
        const adj = candidates.find((d) => weekAdjacent(d.day, first) && d.cap * 60 >= 60);
        if (adj) candidates = [candidates[0], adj, ...candidates.slice(1).filter((d) => d !== adj)];
      }
      for (const d of candidates) {
        if (qualityDays.length >= intensityTypes.length) break;
        const ok = profile.maxStackedQuality <= 1
          ? !weekAdjacent(d.day, longDay) && !qualityDays.some((q) => weekAdjacent(q, d.day))
          : longestWeekRun([...qualityDays, d.day]) <= profile.maxStackedQuality;
        if (ok) qualityDays.push(d.day);
      }
      availableDays.forEach((d, idx) => {
        if (idx === 0) { roleByDay.set(d.day, { type: 'long', kind: 'long', cap: d.cap }); return; }
        const qi = qualityDays.indexOf(d.day);
        roleByDay.set(d.day, qi >= 0
          ? { type: intensityTypes[qi], kind: 'intensity', cap: d.cap }
          : { type: 'endurance', kind: 'easy', cap: d.cap });
      });

      // 2. Place Z1 recovery DELIBERATELY, scaled to training age. Easy days are
      //    Z2 endurance by default. Previously EVERY easy day after a hard day
      //    became a Z1 spin for everyone — a beginner's rule that gave an
      //    advanced "prefers-volume" rider a Z1 ride every Wednesday.
      //    - beginner ('after-every-hard'): recovery after any hard day
      //    - intermediate / advanced ('after-hardest-only'): only after the long
      //      ride or a VO2/anaerobic day, and only up to the weekly allowance
      //    Recovery weeks keep the generous rule — that's what they're for.
      const ordered = [...availableDays].sort((a, b) => a.day - b.day);
      const isHardest = (r: { kind: RideKind; type: string }) =>
        r.kind === 'long' || (r.kind === 'intensity' && /^(vo2max|anaerobic|sprint)/.test(r.type));
      const everyHard = isRecoveryWeek || profile.recoveryRidePolicy === 'after-every-hard';
      const allowance = isRecoveryWeek ? Infinity : recoveryAllowance;
      let placed = 0;
      // Walk the week starting AFTER the long ride so its following day is
      // considered first (wraps Sat → Sun: the day after a Saturday long ride is
      // the most deserving recovery day and used to be skipped entirely).
      const longIdx = ordered.findIndex((d) => d.day === availableDays[0].day);
      const n = ordered.length;
      for (let k = 1; k < n && placed < allowance; k++) {
        const i = (longIdx + k) % n;
        const prevIdx = (i - 1 + n) % n;
        const cur = roleByDay.get(ordered[i].day)!;
        const prev = roleByDay.get(ordered[prevIdx].day)!;
        const adjacent = (ordered[prevIdx].day + 1) % 7 === ordered[i].day;
        const prevQualifies = everyHard ? (prev.kind === 'long' || prev.kind === 'intensity') : isHardest(prev);
        if (cur.kind === 'easy' && adjacent && prevQualifies) {
          cur.kind = 'recovery';
          cur.type = 'recovery';
          placed++;
        }
      }

      // 3. Beginners/intermediates training 6+ days get at least one recovery
      //    ride. Advanced riders do NOT — 6 days with one rest day is normal for
      //    them, and their easy days stay Z2.
      if (level !== 'advanced' && recoveryAllowance > 0 &&
          availableDays.length >= 6 && ![...roleByDay.values()].some((r) => r.kind === 'recovery')) {
        const easies = [...roleByDay.entries()].filter(([, r]) => r.kind === 'easy');
        const longDay = availableDays[0].day;
        let pick =
          // (longDay + 1) % 7 — Saturday (6) → Sunday (0). Plain +1 never matched
          // a Saturday long ride, the most common case.
          easies.find(([day]) => day === (longDay + 1) % 7) ||
          easies.find(([day]) => {
            const prev = roleByDay.get(day - 1);
            return prev && (prev.kind === 'long' || prev.kind === 'intensity');
          }) ||
          // Arbitrary lowest-time day ONLY on an all-easy recovery week. In a
          // loading week a recovery ride must follow hard work — if no easy day
          // does, the week simply doesn't need one.
          (isRecoveryWeek ? easies.sort((a, b) => a[1].cap - b[1].cap)[0] : undefined);
        if (pick) { pick[1].kind = 'recovery'; pick[1].type = 'recovery'; }
      }

      // 4. Build the workouts, each with a deliberate rationale.
      const workouts: WorkoutTemplate[] = [];
      for (const [day, r] of roleByDay) {
        const [baseType, format] = r.type.split(':');
        const dur = sizeDay(r.cap, factor, r.kind);
        workouts.push(format
          ? buildWorkoutFromSpec({ workout_type: baseType, duration_minutes: dur, day_of_week: day, format,
              rationale: rationaleFor(r.kind, r.type) }, level)
          : buildWorkout(r.type, dur, day, rationaleFor(r.kind, r.type), level, step));
      }
      workouts.sort((a, b) => a.day_of_week - b.day_of_week);
      const tss = Math.round(
        workouts.reduce((s, w) => {
          const IF = intensityFactorFor(w.workout_type);
          return s + (w.duration_minutes / 60) * IF * IF * 100;
        }, 0)
      );
      weeks.push({ week_number: weekNumber++, phase, tss, workouts, notes });
    };

    // Recovery-week cadence is ONE counter across base + build (it used to reset
    // at the phase boundary, so a short base ran straight into build: 4+ loading
    // weeks with no recovery). Base: (recoveryWeekEvery - 1) loading weeks then
    // recovery (beginner 2:1, others 3:1). Build loads harder → at most 2:1.
    let loadingRun = 0;
    const nextIsRecovery = (maxLoading: number) => loadingRun >= maxLoading;

    // BASE — aerobic-first, ramping loading weeks + recovery.
    const baseMaxLoading = profile.recoveryWeekEvery - 1;
    for (let i = 0; i < phases.base; i++) {
      const isRec = nextIsRecovery(baseMaxLoading);
      const pos = loadingRun; // 0,1,2 within the current block
      const factor = isRec ? 0.6 : [0.78, 0.86, 0.94][Math.min(pos, 2)];
      // One quality day for beginners, two (sweet spot + tempo) for riders who
      // can absorb it.
      const baseQuality = level === 'beginner' ? ['tempo'] : ['sweet_spot', 'tempo'];
      pushWeek('base', factor, isRec ? [] : baseQuality,
        isRec ? 'Recovery week — easy, reduced volume' : pos === baseMaxLoading - 1 ? 'Peak loading week' : undefined, isRec,
        isRec ? 0 : pos);
      loadingRun = isRec ? 0 : loadingRun + 1;
    }

    // BUILD — threshold-focused, 2 loading + 1 recovery.
    // Weeks carried over from base count toward the base cadence, so build
    // doesn't open with a recovery week; build weeks themselves cap at 2 in a row.
    const buildMaxLoading = Math.min(2, baseMaxLoading);
    let buildRun = 0;
    for (let i = 0; i < phases.build; i++) {
      const isRec = nextIsRecovery(baseMaxLoading) || buildRun >= buildMaxLoading;
      buildRun = isRec ? 0 : buildRun + 1;
      const pos = Math.min(buildRun - 1, 1);
      const factor = isRec ? 0.62 : [0.9, 1.0][pos];
      pushWeek('build', factor, isRec ? ['tempo'] : buildTypes,
        isRec ? 'Recovery week — easy, reduced volume' : pos === 1 ? 'Peak loading week' : undefined, isRec,
        isRec ? 0 : buildRun - 1);
      loadingRun = isRec ? 0 : loadingRun + 1;
    }

    // PEAK — high intensity, near-full volume.
    for (let i = 0; i < phases.peak; i++) {
      const factor = Math.min(1.0, 0.95 + i * 0.02);
      pushWeek('peak', factor, peakTypes, 'Peak phase — race-specific intensity');
    }

    // TAPER — same days, sharply reduced volume, keep a little intensity.
    for (let i = 0; i < phases.taper; i++) {
      const factor = Math.max(0.3, 0.55 - i * 0.12);
      pushWeek('taper', factor, ['threshold'], 'Taper — sharpen and shed fatigue, lower volume');
    }

    return weeks;
  },

  /**
   * Estimate current CTL from recent activities
   */
  async estimateCurrentCTL(athleteId: string): Promise<number> {
    const { data: recentActivities } = await supabaseAdmin
      .from('strava_activities')
      .select('tss')
      .eq('athlete_id', athleteId)
      .gte(
        'start_date',
        new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString()
      )
      .order('start_date', { ascending: false });

    if (!recentActivities || recentActivities.length === 0) {
      return 50; // Default starting CTL for new athletes
    }

    // Simple average TSS per day
    const totalTSS = recentActivities.reduce((sum, a) => sum + (a.tss || 0), 0);
    const avgDailyTSS = totalTSS / 42;

    return Math.round(avgDailyTSS);
  },

  /**
   * Generate week-by-week workout structure
   */
  generateWeeklyStructure(
    athleteId: string,
    ftp: number,
    config: TrainingPlanConfig,
    phases: PhaseDurations,
    startingCTL: number,
    restDays: string[] = []
  ): TrainingWeek[] {
    const weeks: TrainingWeek[] = [];
    let currentCTL = startingCTL;
    let weekNumber = 1;
    const minDuration = getMinDuration(config.weekly_hours);

    // Base phase — 4-week blocks: 3 loading + 1 recovery
    // Loading weeks progressively ramp: 100% → 107% → 115% of target hours
    for (let i = 0; i < phases.base; i++) {
      const isRecoveryWeek = (i + 1) % 4 === 0;
      const positionInBlock = i % 4; // 0, 1, 2 = loading; 3 = recovery
      // Progressive overload: each loading week in the block gets harder
      const loadingMultiplier = isRecoveryWeek ? 1.0 : 1.0 + positionInBlock * 0.07; // 1.0, 1.07, 1.14
      const weeklyTSS = isRecoveryWeek ? currentCTL * 5 : currentCTL * (7 + positionInBlock * 0.5); // 7, 7.5, 8
      const rawWorkouts = this.generateBasePhaseWorkouts(ftp, weeklyTSS, config, restDays);
      const workouts = scaleToWeeklyHours(rawWorkouts, config.weekly_hours, minDuration, isRecoveryWeek, loadingMultiplier);

      weeks.push({
        week_number: weekNumber++,
        phase: 'base',
        tss: Math.round(weeklyTSS),
        workouts,
        notes: isRecoveryWeek ? 'Recovery week - reduce volume' : (positionInBlock === 2 ? 'Hard week - peak loading before recovery' : undefined),
      });

      if (!isRecoveryWeek) {
        currentCTL *= 1.05;
      }
    }

    // Build phase — 3-week blocks: 2 loading + 1 recovery
    // Loading weeks ramp harder: 105% → 115% of target hours
    for (let i = 0; i < phases.build; i++) {
      const isRecoveryWeek = (i + 1) % 3 === 0;
      const positionInBlock = i % 3; // 0, 1 = loading; 2 = recovery
      // Build phase pushes harder than base: starts at 105%, peaks at 115%
      const loadingMultiplier = isRecoveryWeek ? 1.0 : 1.05 + positionInBlock * 0.10; // 1.05, 1.15
      const weeklyTSS = isRecoveryWeek ? currentCTL * 5 : currentCTL * (7.5 + positionInBlock * 0.5); // 7.5, 8.0
      const rawWorkouts = this.generateBuildPhaseWorkouts(ftp, weeklyTSS, config, restDays);
      const workouts = scaleToWeeklyHours(rawWorkouts, config.weekly_hours, minDuration, isRecoveryWeek, loadingMultiplier);

      weeks.push({
        week_number: weekNumber++,
        phase: 'build',
        tss: Math.round(weeklyTSS),
        workouts,
        notes: isRecoveryWeek ? 'Recovery week - maintain intensity, reduce volume' : (positionInBlock === 1 ? 'Hard week - peak loading before recovery' : undefined),
      });

      if (!isRecoveryWeek) {
        currentCTL *= 1.08;
      }
    }

    // Peak phase — high intensity, volume at 105-110% to push limits
    for (let i = 0; i < phases.peak; i++) {
      const loadingMultiplier = 1.05 + (i / Math.max(phases.peak - 1, 1)) * 0.05; // 1.05 → 1.10
      const weeklyTSS = currentCTL * 7.5;
      const rawWorkouts = this.generatePeakPhaseWorkouts(ftp, weeklyTSS, config, restDays);
      const workouts = scaleToWeeklyHours(rawWorkouts, config.weekly_hours, minDuration, false, loadingMultiplier);

      weeks.push({
        week_number: weekNumber++,
        phase: 'peak',
        tss: Math.round(weeklyTSS),
        workouts,
        notes: 'High intensity work - pushing limits',
      });
    }

    // Taper phase — intentionally lower volume (50-60% of normal)
    for (let i = 0; i < phases.taper; i++) {
      const taperFactor = 0.5 - i * 0.1; // 50%, 40%, 30%...
      const weeklyTSS = currentCTL * 7 * taperFactor;
      const rawWorkouts = this.generateTaperPhaseWorkouts(ftp, weeklyTSS, config, restDays);
      // Taper uses reduced hours by design, but still enforce min duration
      const taperHours = config.weekly_hours * Math.max(taperFactor, 0.3);
      const workouts = scaleToWeeklyHours(rawWorkouts, taperHours, minDuration, false);

      weeks.push({
        week_number: weekNumber++,
        phase: 'taper',
        tss: Math.round(weeklyTSS),
        workouts,
        notes: 'Taper week - maintain intensity, reduce volume significantly',
      });
    }

    return weeks;
  },

  /**
   * Generate base phase workouts (aerobic development)
   */
  generateBasePhaseWorkouts(
    ftp: number,
    weeklyTSS: number,
    config: TrainingPlanConfig,
    restDays: string[] = []
  ): WorkoutTemplate[] {
    const workouts: WorkoutTemplate[] = [];
    const workoutsPerWeek = Math.min(Math.floor(config.weekly_hours / 1.5), 6);
    const avgTSSPerWorkout = weeklyTSS / workoutsPerWeek;

    // Convert rest day names to numbers (0=Sunday, 6=Saturday)
    const dayMap: Record<string, number> = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    const restDayNumbers = restDays.map(day => dayMap[day]).filter(d => d !== undefined);

    // Available training days (excluding rest days)
    const availableDays = [1, 2, 3, 4, 5, 6, 0].filter(day => !restDayNumbers.includes(day));

    if (availableDays.length === 0) {
      // If all days are rest days (shouldn't happen), return empty
      return [];
    }

    let dayIndex = 0;

    // Endurance workout
    if (workoutsPerWeek >= 1 && availableDays.length > dayIndex) {
      workouts.push({
        name: 'Base Endurance',
        description: 'Steady aerobic endurance ride',
        workout_type: 'endurance',
        duration_minutes: Math.round((avgTSSPerWorkout / 65) * 100),
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 3000, power: 72, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    // Tempo workout
    if (workoutsPerWeek >= 2 && availableDays.length > dayIndex) {
      workouts.push({
        name: 'Tempo Building',
        description: 'Upper Zone 2 / lower Zone 3 tempo work',
        workout_type: 'tempo',
        duration_minutes: Math.round((avgTSSPerWorkout / 75) * 100),
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 1200, power: 78, type: 'work' },
          { duration: 300, power: 60, type: 'rest' },
          { duration: 1200, power: 78, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    // Long endurance (prefer Saturday if available, else use next available day)
    if (workoutsPerWeek >= 3 && availableDays.length > dayIndex) {
      const longRideTSS = avgTSSPerWorkout * 1.5;
      const preferredDay = availableDays.includes(6) ? 6 : availableDays[dayIndex++];

      workouts.push({
        name: 'Long Base Ride',
        description: 'Extended aerobic endurance',
        workout_type: 'endurance',
        duration_minutes: Math.round((longRideTSS / 65) * 100),
        day_of_week: preferredDay,
        intervals: [
          { duration: 900, power: 60, type: 'warmup' },
          { duration: 5400, power: 70, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    // Easy recovery - skip if day is a rest day
    if (workoutsPerWeek >= 4 && availableDays.length > dayIndex) {
      workouts.push({
        name: 'Easy Recovery',
        description: 'Low intensity recovery ride',
        workout_type: 'recovery',
        duration_minutes: 60,
        day_of_week: availableDays[dayIndex++],
        intervals: [{ duration: 3600, power: 55, type: 'work' }],
      });
    }

    return workouts;
  },

  /**
   * Generate build phase workouts (threshold and tempo)
   */
  generateBuildPhaseWorkouts(
    ftp: number,
    weeklyTSS: number,
    config: TrainingPlanConfig,
    restDays: string[] = []
  ): WorkoutTemplate[] {
    const workouts: WorkoutTemplate[] = [];
    const workoutsPerWeek = Math.min(Math.floor(config.weekly_hours / 1.5), 6);

    // Convert rest day names to numbers
    const dayMap: Record<string, number> = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    const restDayNumbers = restDays.map(day => dayMap[day]).filter(d => d !== undefined);

    // Available training days (excluding rest days)
    const availableDays = [2, 4, 6, 1, 3, 5, 0].filter(day => !restDayNumbers.includes(day));

    if (availableDays.length === 0) return [];

    let dayIndex = 0;

    // Sweet Spot / Threshold
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Sweet Spot Intervals',
        description: 'Sub-threshold intervals at 88-94% FTP',
        workout_type: 'threshold',
        duration_minutes: 90,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 1200, power: 90, type: 'work', repeat: 3 },
          { duration: 300, power: 60, type: 'rest', repeat: 3 },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
        rationale: 'Build FTP and lactate threshold',
      });
    }

    // Tempo with bursts
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Tempo + Bursts',
        description: 'Tempo pace with short harder efforts',
        workout_type: 'tempo',
        duration_minutes: 75,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 600, power: 85, type: 'work' },
          { duration: 30, power: 110, type: 'work', repeat: 4 },
          { duration: 90, power: 85, type: 'work', repeat: 4 },
          { duration: 300, power: 60, type: 'rest' },
          { duration: 600, power: 85, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    // Over-Unders
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Over-Under Intervals',
        description: 'Alternating above and below threshold',
        workout_type: 'threshold',
        duration_minutes: 90,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 180, power: 95, type: 'work', repeat: 3 },
          { duration: 120, power: 105, type: 'work', repeat: 3 },
          { duration: 420, power: 60, type: 'rest' },
          { duration: 180, power: 95, type: 'work', repeat: 3 },
          { duration: 120, power: 105, type: 'work', repeat: 3 },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
        rationale: 'Improve ability to clear lactate at threshold',
      });
    }

    // Endurance maintenance
    if (workoutsPerWeek >= 4 && availableDays.length > dayIndex) {
      workouts.push({
        name: 'Endurance Maintenance',
        description: 'Maintain aerobic base',
        workout_type: 'endurance',
        duration_minutes: 120,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 6000, power: 72, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    return workouts;
  },

  /**
   * Generate peak phase workouts (VO2max and race-specific)
   */
  generatePeakPhaseWorkouts(
    ftp: number,
    weeklyTSS: number,
    config: TrainingPlanConfig,
    restDays: string[] = []
  ): WorkoutTemplate[] {
    const workouts: WorkoutTemplate[] = [];

    // Convert rest day names to numbers
    const dayMap: Record<string, number> = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    const restDayNumbers = restDays.map(day => dayMap[day]).filter(d => d !== undefined);

    // Available training days (excluding rest days)
    const availableDays = [2, 4, 6, 1, 3, 5, 0].filter(day => !restDayNumbers.includes(day));

    if (availableDays.length < 2) return []; // Need at least 2 days for peak phase

    let dayIndex = 0;

    // VO2max intervals
    workouts.push({
      name: 'VO2max Intervals',
      description: 'High intensity VO2max efforts',
      workout_type: 'vo2max',
      duration_minutes: 75,
      day_of_week: availableDays[dayIndex++],
      intervals: [
        { duration: 900, power: 65, type: 'warmup' },
        { duration: 300, power: 115, type: 'work', repeat: 5 },
        { duration: 300, power: 55, type: 'rest', repeat: 5 },
        { duration: 300, power: 55, type: 'cooldown' },
      ],
      rationale: 'Maximize aerobic power',
    });

    // Threshold
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Threshold Blocks',
        description: 'Sustained threshold efforts',
        workout_type: 'threshold',
        duration_minutes: 90,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 65, type: 'warmup' },
          { duration: 1200, power: 95, type: 'work', repeat: 2 },
          { duration: 600, power: 60, type: 'rest', repeat: 2 },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    // Race simulation
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Race Simulation',
        description: 'Simulate race efforts with surges',
        workout_type: 'custom',
        duration_minutes: 90,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 900, power: 65, type: 'warmup' },
          { duration: 1800, power: 85, type: 'work' },
          { duration: 60, power: 120, type: 'work', repeat: 3 },
          { duration: 180, power: 90, type: 'work', repeat: 3 },
          { duration: 1200, power: 95, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
        rationale: 'Practice race pace with surges',
      });
    }

    // Recovery workout
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Active Recovery',
        description: 'Easy spin to recover',
        workout_type: 'recovery',
        duration_minutes: 60,
        day_of_week: availableDays[dayIndex++],
        intervals: [{ duration: 3600, power: 58, type: 'work' }],
      });
    }

    return workouts;
  },

  /**
   * Generate taper phase workouts (maintain intensity, reduce volume)
   */
  generateTaperPhaseWorkouts(
    ftp: number,
    weeklyTSS: number,
    config: TrainingPlanConfig,
    restDays: string[] = []
  ): WorkoutTemplate[] {
    const workouts: WorkoutTemplate[] = [];

    // Convert rest day names to numbers
    const dayMap: Record<string, number> = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    const restDayNumbers = restDays.map(day => dayMap[day]).filter(d => d !== undefined);

    // Available training days (excluding rest days) — maintain training frequency
    const availableDays = [2, 4, 5, 1, 3, 6, 0].filter(day => !restDayNumbers.includes(day));

    if (availableDays.length === 0) return [];

    let dayIndex = 0;

    // 1. Threshold maintenance — reduced volume, same intensity
    workouts.push({
      name: 'Threshold Sharpener',
      description: 'Maintain FTP with reduced volume — 3x8min at threshold with full recovery',
      workout_type: 'threshold',
      duration_minutes: 60,
      day_of_week: availableDays[dayIndex++ % availableDays.length],
      intervals: [
        { duration: 600, power: 65, type: 'warmup' },
        { duration: 480, power: 100, type: 'work', repeat: 3 },
        { duration: 300, power: 55, type: 'rest', repeat: 3 },
        { duration: 300, power: 55, type: 'cooldown' },
      ],
      rationale: 'Maintain threshold fitness without generating fatigue. Reduce volume, keep intensity.',
    });

    // 2. Easy endurance — shorter than normal
    if (dayIndex < availableDays.length) {
      workouts.push({
        name: 'Easy Endurance',
        description: 'Reduced-volume Z2 ride to maintain aerobic base',
        workout_type: 'endurance',
        duration_minutes: 75,
        day_of_week: availableDays[dayIndex++ % availableDays.length],
        intervals: [{ duration: 4500, power: 65, type: 'work' }],
        rationale: 'Maintain aerobic fitness with reduced volume. Keep legs turning over.',
      });
    }

    // 3. VO2max openers — short and sharp
    if (dayIndex < availableDays.length) {
      workouts.push({
        name: 'Race Openers',
        description: 'Short high-intensity efforts to keep neuromuscular systems sharp',
        workout_type: 'vo2max',
        duration_minutes: 50,
        day_of_week: availableDays[dayIndex++ % availableDays.length],
        intervals: [
          { duration: 600, power: 65, type: 'warmup' },
          { duration: 120, power: 115, type: 'work', repeat: 4 },
          { duration: 240, power: 55, type: 'rest', repeat: 4 },
          { duration: 30, power: 150, type: 'work', repeat: 2 },
          { duration: 180, power: 50, type: 'rest', repeat: 2 },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
        rationale: 'VO2max bursts + sprints to stay sharp. NOT fatiguing — think reminders, not workouts.',
      });
    }

    // 4. Easy spin — active recovery
    if (dayIndex < availableDays.length) {
      workouts.push({
        name: 'Easy Spin',
        description: 'Very easy recovery ride with high cadence',
        workout_type: 'recovery',
        duration_minutes: 45,
        day_of_week: availableDays[dayIndex++ % availableDays.length],
        intervals: [{ duration: 2700, power: 50, type: 'work' }],
        rationale: 'Active recovery — flush legs, maintain neuromuscular patterns.',
      });
    }

    // 5. Pre-race activation (2 days before race day)
    if (dayIndex < availableDays.length) {
      workouts.push({
        name: 'Pre-Race Activation',
        description: 'Final tune-up: warmup, race-pace openers, cool down',
        workout_type: 'custom',
        duration_minutes: 45,
        day_of_week: availableDays[dayIndex++ % availableDays.length],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 60, power: 115, type: 'work', repeat: 4 },
          { duration: 120, power: 55, type: 'rest', repeat: 4 },
          { duration: 30, power: 150, type: 'work', repeat: 2 },
          { duration: 120, power: 50, type: 'rest', repeat: 2 },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
        rationale: 'Activate all systems without generating fatigue. Arrive at start line sharp.',
      });
    }

    return workouts;
  },

  /**
   * Save training plan to database
   */
  async savePlan(athleteId: string, plan: TrainingPlan): Promise<void> {
    const endDate = new Date(plan.start_date);
    endDate.setDate(endDate.getDate() + plan.weeks.length * 7);

    const { error } = await supabaseAdmin.from('training_plans').insert({
      id: plan.id,
      athlete_id: athleteId,
      goal_event: plan.goal_event,
      event_date: plan.event_date,
      start_date: plan.start_date,
      end_date: endDate.toISOString().split('T')[0],
      weeks: plan.weeks,
      total_tss: plan.total_tss,
      total_weeks: plan.weeks.length,
      status: 'active',
    });

    if (error) {
      throw new Error(`Failed to save training plan: ${error.message}`);
    }
  },

  /**
   * Get active training plan for athlete
   */
  /**
   * Best-effort: flip any of this athlete's 'active' plans whose end_date has
   * already passed to 'completed', so a finished plan stops being treated as
   * the current plan (it was showing at the top of the Plans page indefinitely).
   * Fire-and-forget — callers don't await it; the read filters below guarantee
   * correctness even if this write is momentarily behind.
   */
  completeEndedPlans(athleteId: string, today: string): void {
    supabaseAdmin
      .from('training_plans')
      .update({ status: 'completed' })
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .not('end_date', 'is', null)
      .lt('end_date', today)
      .then(({ error }) => {
        if (error) logger.warn('completeEndedPlans failed:', error);
      });
  },

  async getActivePlan(athleteId: string): Promise<TrainingPlan | null> {
    const today = new Date().toISOString().split('T')[0];
    this.completeEndedPlans(athleteId, today);

    const { data, error } = await supabaseAdmin
      .from('training_plans')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      // A plan that has run its course is no longer "active". Legacy rows with a
      // null end_date are kept (we can't tell when they end).
      .or(`end_date.gte.${today},end_date.is.null`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      athlete_id: data.athlete_id,
      goal_event: data.goal_event,
      event_date: data.event_date,
      start_date: data.start_date,
      weeks: data.weeks,
      total_tss: data.total_tss,
      created_at: data.created_at,
    };
  },

  /**
   * Get all active training plans for athlete, sorted by start_date ascending (soonest first)
   */
  async getActivePlans(athleteId: string): Promise<TrainingPlan[]> {
    const today = new Date().toISOString().split('T')[0];
    this.completeEndedPlans(athleteId, today);

    const { data, error } = await supabaseAdmin
      .from('training_plans')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .or(`end_date.gte.${today},end_date.is.null`)
      .order('start_date', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((d: any) => ({
      id: d.id,
      athlete_id: d.athlete_id,
      goal_event: d.goal_event,
      event_date: d.event_date,
      start_date: d.start_date,
      weeks: d.weeks,
      total_tss: d.total_tss,
      created_at: d.created_at,
    }));
  },

  /**
   * Get training plan by ID
   */
  async getPlanById(planId: string, athleteId: string): Promise<TrainingPlan | null> {
    const { data, error } = await supabaseAdmin
      .from('training_plans')
      .select('*')
      .eq('id', planId)
      .eq('athlete_id', athleteId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      athlete_id: data.athlete_id,
      goal_event: data.goal_event,
      event_date: data.event_date,
      start_date: data.start_date,
      weeks: data.weeks,
      total_tss: data.total_tss,
      created_at: data.created_at,
    };
  },

  /**
   * Delete training plan. Optionally remove associated calendar entries and workouts.
   */
  async deletePlan(planId: string, athleteId: string, removeWorkouts: boolean = false): Promise<{ removedCount: number }> {
    let removedCount = 0;

    if (removeWorkouts) {
      // Delete calendar entries linked to this plan first (FK constraint)
      const { data: deletedEntries } = await supabaseAdmin
        .from('calendar_entries')
        .delete()
        .eq('training_plan_id', planId)
        .select('id');

      removedCount = deletedEntries?.length || 0;

      // Plan-generated rest markers ("Planned rest day") are inserted without a
      // training_plan_id by the template path, so the delete above misses them —
      // a deleted plan left its Sundays behind. Remove FUTURE ones inside this
      // plan's date range. Rest days set separately carry a different rationale
      // and are kept.
      const { data: planRow } = await supabaseAdmin
        .from('training_plans').select('start_date, end_date, event_date').eq('id', planId).eq('athlete_id', athleteId).single();
      const todayIso = new Date().toISOString().split('T')[0];
      const rangeStart = planRow?.start_date && planRow.start_date > todayIso ? planRow.start_date : todayIso;
      const rangeEnd = planRow?.end_date || planRow?.event_date;
      if (rangeEnd) {
        const { data: restRemoved } = await supabaseAdmin
          .from('calendar_entries')
          .delete()
          .eq('athlete_id', athleteId)
          .eq('entry_type', 'rest')
          .is('workout_id', null)
          .eq('ai_rationale', 'Planned rest day')
          .gte('scheduled_date', rangeStart)
          .lte('scheduled_date', rangeEnd)
          .select('id');
        removedCount += restRemoved?.length || 0;
      }

      // Delete workouts linked to this plan
      await supabaseAdmin
        .from('workouts')
        .delete()
        .eq('training_plan_id', planId)
        .eq('athlete_id', athleteId);
    }

    const { error } = await supabaseAdmin
      .from('training_plans')
      .update({ status: 'cancelled' })
      .eq('id', planId)
      .eq('athlete_id', athleteId);

    if (error) {
      throw new Error(`Failed to delete training plan: ${error.message}`);
    }

    return { removedCount };
  },

  /**
   * Schedule training plan to calendar
   */
  async schedulePlanToCalendar(
    athleteId: string,
    plan: TrainingPlan
  ): Promise<{ scheduledCount: number; workoutIds: string[] }> {
    const start = parsePlanDate(plan.start_date);

    // Flatten all week+workout combos, computing each one's REAL calendar date
    // (weekday-anchored, not a raw offset). Drop anything before the start date
    // — week 1 can legitimately have days earlier in the week than the start.
    const items = plan.weeks
      .flatMap((week) => week.workouts.map((wt) => ({ week, wt, date: workoutDateFor(plan.start_date, week.week_number, wt.day_of_week) })))
      .filter((it) => it.date.getTime() >= start.getTime());

    // Step 1: Create workouts with capped concurrency. Fully-parallel
    // Promise.all over every workout opened 2+ DB connections each at once
    // (250+ for an 84-workout plan), exhausting Supabase's pool (PGRST003).
    // Batches of 5 stay fast without saturating the pool.
    const createdWorkouts = await mapWithConcurrency(items, 5, ({ week, wt }) =>
      workoutService.createWorkout(athleteId, {
        name: wt.name,
        description: wt.description,
        workout_type: wt.workout_type as any,
        duration_minutes: wt.duration_minutes,
        intervals: wt.intervals,
        generated_by_ai: true,
        ai_prompt: `Training plan: ${plan.goal_event} - Week ${week.week_number} (${week.phase} phase)`,
        training_plan_id: plan.id,
      })
    );

    // Step 2: Schedule calendar entries with the same concurrency cap.
    // skipIntervalsAutoSync=true: don't fire 84 racing per-entry uploads — a
    // single reconcileIntervalsIcu() below wipes any prior plan's events and
    // re-uploads the whole new plan cleanly.
    await mapWithConcurrency(createdWorkouts, 5, (workout, i) => {
      const { week, wt, date } = items[i];
      return calendarService.scheduleWorkout(
        athleteId,
        workout.id,
        date,
        wt.rationale || `Week ${week.week_number} - ${week.phase} phase: ${wt.name}`,
        plan.id,
        week.week_number,
        true
      );
    });

    // Schedule rest days for all dates in the plan range without workouts
    try {
      const workoutDates = new Set<string>(
        items.map((it) => it.date.toISOString().split('T')[0])
      );

      const endDate = new Date(plan.event_date + 'T12:00:00');
      const restDayEntries: { athlete_id: string; workout_id: null; scheduled_date: string; entry_type: string; ai_rationale: string; completed: boolean }[] = [];
      const cursor = new Date(start);
      while (cursor <= endDate) {
        const dateStr = cursor.toISOString().split('T')[0];
        if (!workoutDates.has(dateStr)) {
          restDayEntries.push({
            athlete_id: athleteId,
            workout_id: null,
            scheduled_date: dateStr,
            entry_type: 'rest',
            ai_rationale: 'Planned rest day',
            completed: false,
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      if (restDayEntries.length > 0) {
        await supabaseAdmin.from('calendar_entries').insert(restDayEntries);
      }
    } catch (err: any) {
      logger.error('Failed to schedule rest days:', err.message);
    }

    // Reconcile intervals.icu once for the whole plan: wipes any prior plan's
    // future "Draft -" events and uploads this plan. Fire-and-forget (swallows
    // its own errors) so it never blocks or fails the build.
    void calendarService.reconcileIntervalsIcu(athleteId);

    return {
      scheduledCount: createdWorkouts.length,
      workoutIds: createdWorkouts.map((w) => w.id),
    };
  },
};
