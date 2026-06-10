import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../utils/supabase';
import { workoutService } from './workoutService';
import { calendarService } from './calendarService';
import { athletePreferencesService } from './athletePreferencesService';
import { logger } from '../utils/logger';
import { mapWithConcurrency } from '../utils/concurrency';
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
    default: return 0.75;
  }
}

/**
 * Build a structured interval list that sums EXACTLY to durationMinutes. Warmup
 * + work + cooldown; for interval types the work portion is broken into
 * work/recovery repeats (so a "threshold" ride isn't one impossible 90-min
 * block). The remainder is always absorbed as easy spinning so totals are exact.
 */
export function buildIntervalsForType(type: string, durationMinutes: number): any[] {
  const total = durationMinutes * 60;
  const warm = Math.min(600, Math.round(total * 0.15));
  const cool = Math.min(300, Math.round(total * 0.1));
  let workSec = total - warm - cool;
  if (workSec < 60) return [{ duration: total, power: 58, type: 'work' }]; // tiny ride: just spin

  const out: any[] = [{ duration: warm, power: 60, type: 'warmup' }];

  const repeats = (workLen: number, workPower: number, restLen: number, restPower: number) => {
    let remaining = workSec;
    while (remaining >= workLen + restLen) {
      out.push({ duration: workLen, power: workPower, type: 'work' });
      out.push({ duration: restLen, power: restPower, type: 'rest' });
      remaining -= workLen + restLen;
    }
    if (remaining > 0) out.push({ duration: remaining, power: restPower, type: 'rest' });
  };

  switch (type) {
    case 'threshold': repeats(480, 93, 180, 60); break;       // 8-min threshold reps
    case 'sweet_spot': repeats(720, 90, 240, 60); break;      // 12-min sweet-spot blocks
    case 'vo2max': repeats(180, 110, 120, 55); break;         // 3-min VO2 reps
    case 'anaerobic': repeats(40, 130, 200, 50); break;       // 40s anaerobic bursts
    case 'tempo': repeats(900, 82, 180, 62); break;           // 15-min tempo blocks
    case 'recovery': out.push({ duration: workSec, power: 55, type: 'work' }); break;
    default: out.push({ duration: workSec, power: 70, type: 'work' }); break; // endurance/long
  }

  out.push({ duration: cool, power: 55, type: 'cooldown' });
  return out;
}

const TYPE_LABELS: Record<string, { name: string; description: string }> = {
  long: { name: 'Long Endurance Ride', description: 'Extended aerobic Zone 2 — your biggest day' },
  endurance: { name: 'Endurance Ride', description: 'Steady aerobic Zone 2 to build volume' },
  recovery: { name: 'Recovery Spin', description: 'Very easy spin to promote recovery' },
  tempo: { name: 'Tempo Ride', description: 'Sustained Zone 3 tempo blocks' },
  threshold: { name: 'Threshold Intervals', description: 'Sub/at-threshold intervals to lift FTP' },
  vo2max: { name: 'VO2max Intervals', description: 'High-intensity 3-min VO2max efforts' },
};

/** Build one workout of a given type, sized to durationMinutes, on a given day. */
function buildWorkout(type: string, durationMinutes: number, dayOfWeek: number, rationale?: string): WorkoutTemplate {
  const label = TYPE_LABELS[type] || TYPE_LABELS.endurance;
  const workoutType = type === 'long' ? 'endurance' : type;
  return {
    name: label.name,
    description: label.description,
    workout_type: workoutType,
    duration_minutes: durationMinutes,
    day_of_week: dayOfWeek,
    intervals: buildIntervalsForType(type, durationMinutes),
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
}): WorkoutTemplate {
  const fallback = TYPE_LABELS[spec.workout_type] || TYPE_LABELS.endurance;
  return {
    name: spec.name || fallback.name,
    description: spec.rationale || fallback.description,
    workout_type: spec.workout_type === 'long' ? 'endurance' : spec.workout_type,
    duration_minutes: spec.duration_minutes,
    day_of_week: spec.day_of_week,
    intervals: buildIntervalsForType(spec.workout_type, spec.duration_minutes),
    rationale: spec.rationale,
  };
}

const VALID_WORKOUT_TYPES = new Set([
  'recovery', 'endurance', 'long', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic',
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
export function normalizeAiPlan(
  aiWeeks: any[],
  availableDays: { day: number; cap: number }[],
  meta: { goal_event: string; eventIso: string; startIso: string; athleteId: string }
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

      byDay.set(day, buildWorkoutFromSpec({
        workout_type: type,
        duration_minutes: dur,
        day_of_week: day,
        name: typeof wk?.name === 'string' ? wk.name.slice(0, 80) : undefined,
        rationale: typeof wk?.rationale === 'string' ? wk.rationale.slice(0, 300) : undefined,
      }));
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
      .select('ftp, timezone')
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
      weeks = this.generatePerDayWeeks(athlete.ftp, phases, availableDays);
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
    availableDays: { day: number; cap: number }[] // pre-sorted by cap desc
  ): TrainingWeek[] {
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
          return type === 'vo2max' ? 'VO2max intervals to raise your aerobic ceiling.'
            : type === 'threshold' ? 'Threshold work to lift sustainable power (FTP).'
            : 'Tempo to build aerobic strength without deep fatigue.';
        default: return 'Aerobic endurance — adds volume without extra stress.';
      }
    };

    const weeks: TrainingWeek[] = [];
    let weekNumber = 1;

    const pushWeek = (phase: TrainingPhase, factor: number, intensityTypes: string[], notes?: string) => {
      // 1. Assign a role to each available day by time: the biggest day is the
      //    long ride, the next-biggest are the phase's intensity sessions, the
      //    rest start as easy endurance.
      const roleByDay = new Map<number, { type: string; kind: RideKind; cap: number }>();
      availableDays.forEach((d, idx) => {
        if (idx === 0) { roleByDay.set(d.day, { type: 'long', kind: 'long', cap: d.cap }); return; }
        const it = intensityTypes[idx - 1];
        roleByDay.set(d.day, it
          ? { type: it, kind: 'intensity', cap: d.cap }
          : { type: 'endurance', kind: 'easy', cap: d.cap });
      });

      // 2. Place recovery DELIBERATELY: an easy day that immediately follows a
      //    hard day (in weekday order) becomes a short recovery spin. Hard days
      //    CAN run back-to-back (intentional overload) — but the day after a
      //    hard block is active recovery, not just more endurance.
      const ordered = [...availableDays].sort((a, b) => a.day - b.day);
      for (let i = 1; i < ordered.length; i++) {
        const cur = roleByDay.get(ordered[i].day)!;
        const prev = roleByDay.get(ordered[i - 1].day)!;
        const adjacent = ordered[i].day - ordered[i - 1].day === 1;
        if (cur.kind === 'easy' && adjacent && (prev.kind === 'long' || prev.kind === 'intensity')) {
          cur.kind = 'recovery';
          cur.type = 'recovery';
        }
      }

      // 3. If they train 6+ days a week, GUARANTEE at least one recovery ride.
      //    Place it deliberately: prefer the day right after the long ride, then
      //    any day after a hard day, then (on an all-easy recovery/taper week)
      //    the lowest-time day.
      if (availableDays.length >= 6 && ![...roleByDay.values()].some((r) => r.kind === 'recovery')) {
        const easies = [...roleByDay.entries()].filter(([, r]) => r.kind === 'easy');
        const longDay = availableDays[0].day;
        let pick =
          easies.find(([day]) => day === longDay + 1) ||
          easies.find(([day]) => {
            const prev = roleByDay.get(day - 1);
            return prev && (prev.kind === 'long' || prev.kind === 'intensity');
          }) ||
          easies.sort((a, b) => a[1].cap - b[1].cap)[0];
        if (pick) { pick[1].kind = 'recovery'; pick[1].type = 'recovery'; }
      }

      // 4. Build the workouts, each with a deliberate rationale.
      const workouts: WorkoutTemplate[] = [];
      for (const [day, r] of roleByDay) {
        workouts.push(buildWorkout(r.type, sizeDay(r.cap, factor, r.kind), day, rationaleFor(r.kind, r.type)));
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

    // BASE — 4-week blocks: 3 loading (ramping) + 1 recovery. One tempo quality day.
    for (let i = 0; i < phases.base; i++) {
      const pos = i % 4;
      const isRec = pos === 3;
      const factor = isRec ? 0.6 : [0.78, 0.86, 0.94][pos];
      pushWeek('base', factor, isRec ? [] : ['tempo'],
        isRec ? 'Recovery week — easy, reduced volume' : pos === 2 ? 'Peak loading week' : undefined);
    }

    // BUILD — 3-week blocks: 2 loading + 1 recovery. Threshold-focused.
    for (let i = 0; i < phases.build; i++) {
      const pos = i % 3;
      const isRec = pos === 2;
      const factor = isRec ? 0.62 : [0.9, 1.0][pos];
      pushWeek('build', factor, isRec ? ['tempo'] : ['threshold', 'tempo', 'threshold'],
        isRec ? 'Recovery week — easy, reduced volume' : pos === 1 ? 'Peak loading week' : undefined);
    }

    // PEAK — high intensity, near-full volume.
    for (let i = 0; i < phases.peak; i++) {
      const factor = Math.min(1.0, 0.95 + i * 0.02);
      pushWeek('peak', factor, ['vo2max', 'threshold', 'tempo'], 'Peak phase — race-specific intensity');
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
  async getActivePlan(athleteId: string): Promise<TrainingPlan | null> {
    const { data, error } = await supabaseAdmin
      .from('training_plans')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
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
    const { data, error } = await supabaseAdmin
      .from('training_plans')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
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
    await mapWithConcurrency(createdWorkouts, 5, (workout, i) => {
      const { week, wt, date } = items[i];
      return calendarService.scheduleWorkout(
        athleteId,
        workout.id,
        date,
        wt.rationale || `Week ${week.week_number} - ${week.phase} phase: ${wt.name}`,
        plan.id,
        week.week_number
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

    return {
      scheduledCount: createdWorkouts.length,
      workoutIds: createdWorkouts.map((w) => w.id),
    };
  },
};
