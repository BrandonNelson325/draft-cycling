/**
 * Back-to-back hard days guard for coach calendar edits.
 *
 * Oct 27 2026: the athlete asked to pull sprints onto the day after a maximal
 * ZRL race; the coach just did it ("nice call doing the sprints while your
 * legs are still fresh from today's race"). A real coach flags that first.
 * Hard-on-hard is allowed when it's deliberate — so this never forbids it, it
 * makes the coach say so and get a yes before the change goes through.
 */

export const HARD_TYPES = new Set(['threshold', 'vo2max', 'anaerobic', 'sprint']);
const HARD_NAME = /\b(race|ftp test|test)\b/i;

export interface DayLoad {
  /** Completed rides that day. rpe is the app's 1–5 scale (5 = Max). */
  rides: { name: string; rpe?: number | null; intensityFactor?: number | null; tss?: number | null }[];
  /** Uncompleted scheduled workouts that day (excluding the one being moved). */
  planned: { name: string; workout_type?: string | null }[];
}

export function isHardWorkout(w: { name?: string | null; workout_type?: string | null }): boolean {
  return HARD_TYPES.has(String(w.workout_type || '')) || HARD_NAME.test(String(w.name || ''));
}

/** A day this big is hard even if no single ride was (e.g. 3 moderate rides). */
export const HARD_DAY_TSS = 100;

/**
 * Why a day counts as hard, or null. Judges the WHOLE day — a race morning is
 * warm-up + race + spin, and the athlete expects all of it counted.
 */
export function hardDayReason(day: DayLoad): string | null {
  const isRace = (n: string) => /\brace\b/i.test(n) && !/warm-?up|pre-race/i.test(n);
  // Hardest ride first, so the message names the race — not its warm-up.
  const rides = [...day.rides].sort(
    (a, b) =>
      Number(isRace(b.name)) - Number(isRace(a.name)) ||
      (b.rpe ?? 0) - (a.rpe ?? 0) ||
      (b.intensityFactor ?? 0) - (a.intensityFactor ?? 0)
  );
  const totalTss = Math.round(rides.reduce((sum, r) => sum + (r.tss || 0), 0));
  const top = rides[0];

  let hardest: string | null = null;
  if (top && isRace(top.name)) hardest = `raced ("${top.name}"${top.rpe ? `, RPE ${top.rpe}/5` : ''})`;
  else if (top && (top.rpe ?? 0) >= 4) hardest = `a hard ride ("${top.name}", RPE ${top.rpe}/5)`;
  else if (top && (top.intensityFactor ?? 0) >= 0.85) hardest = `a hard ride ("${top.name}", IF ${top.intensityFactor!.toFixed(2)})`;

  if (hardest || totalTss >= HARD_DAY_TSS) {
    const whole = rides.length > 1 ? `${rides.length} rides, ${totalTss} TSS total` : totalTss ? `${totalTss} TSS` : '';
    if (!hardest) return `a big day (${whole}: ${rides.map((r) => `"${r.name}"`).join(', ')})`;
    return whole ? `${hardest} — ${whole}` : hardest;
  }
  const p = day.planned.find(isHardWorkout);
  return p ? `"${p.name}" scheduled` : null;
}

/**
 * Returns a message for the coach when placing `workout` on a date sits right
 * next to another hard day; null when it's fine.
 */
export function backToBackConflict(
  workout: { name?: string | null; workout_type?: string | null },
  dayBefore: DayLoad,
  dayAfter: DayLoad
): string | null {
  if (!isHardWorkout(workout)) return null;
  const before = hardDayReason(dayBefore);
  const after = hardDayReason(dayAfter);
  if (!before && !after) return null;
  const parts = [before && `the day before: ${before}`, after && `the day after: ${after}`].filter(Boolean);
  return `"${workout.name}" is a hard session and would land next to another hard day (${parts.join('; ')}).`;
}
