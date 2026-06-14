/**
 * Proves the safety net around the Opus plan designer: no matter what the model
 * returns, normalizeAiPlan produces a plan that respects the athlete's
 * availability and is always schedulable. This is what makes "AI designs the
 * plan" reliable — we never trust the model's output blindly.
 *
 * Run: npm run test:ai-plan
 */
import { availableDaysFromDailyHours, normalizeAiPlan } from '../services/trainingPlanService';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

const DAILY = { monday: 1.5, tuesday: 2, wednesday: 1.5, thursday: 2, friday: 1.5, saturday: 5, sunday: 0 };
const CAP: Record<number, number> = { 0: 0, 1: 1.5, 2: 2, 3: 1.5, 4: 2, 5: 1.5, 6: 5 };
const availableDays = availableDaysFromDailyHours(DAILY);

// A deliberately MESSY model output: rest-day workouts, over-cap durations,
// bad types, duplicate days, an all-invalid week, missing fields.
const messyWeeks = [
  {
    week_number: 1,
    phase: 'base',
    focus: 'intro',
    workouts: [
      { day_of_week: 0, workout_type: 'threshold', duration_minutes: 120, name: 'Sunday hard', rationale: 'x' }, // Sunday = rest → drop
      { day_of_week: 6, workout_type: 'endurance', duration_minutes: 600, name: 'Epic', rationale: 'long' },      // 600 > 300 cap → clamp
      { day_of_week: 2, workout_type: 'foobar', duration_minutes: 90, name: 'Mystery', rationale: 'bad type' },   // invalid type → endurance
      { day_of_week: 2, workout_type: 'tempo', duration_minutes: 60, name: 'Dup Tue', rationale: 'dup' },         // duplicate Tue → drop
      { day_of_week: 4, workout_type: 'vo2max', duration_minutes: 60, name: 'VO2', rationale: 'ceiling' },
    ],
  },
  {
    week_number: 2,
    phase: 'taper',
    workouts: [
      { day_of_week: 0, workout_type: 'recovery', duration_minutes: 30, name: 'rest day ride', rationale: 'x' }, // only invalid day → week dropped
    ],
  },
  {
    week_number: 3,
    phase: 'build',
    workouts: [
      { day_of_week: 6, workout_type: 'endurance', duration_minutes: 240, name: 'Long', rationale: 'vol' },
      { day_of_week: 1, workout_type: 'sweet_spot', duration_minutes: 90, name: 'SS', rationale: 'ftp' },
      { day_of_week: 3, workout_type: 'anaerobic', duration_minutes: 60, name: 'Bursts', rationale: 'top end' },
    ],
  },
];

const VALID = new Set(['recovery', 'endurance', 'long', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic']);

const plan = normalizeAiPlan(messyWeeks, availableDays, {
  goal_event: '200-mile TTT',
  eventIso: '2026-09-12',
  startIso: '2026-06-15',
  athleteId: 'athlete-1',
});
const all = plan.weeks.flatMap((w) => w.workouts);

check('Empty/all-invalid weeks are dropped (2 of 3 weeks kept)', plan.weeks.length === 2, `${plan.weeks.length} weeks`);
check('Week numbers are resequenced 1..N', plan.weeks.every((w, i) => w.week_number === i + 1));
check('No workout on a rest day (Sunday)', all.every((w) => w.day_of_week !== 0));
check('No workout exceeds its day cap', all.every((w) => w.duration_minutes <= CAP[w.day_of_week] * 60),
  all.map((w) => `${w.day_of_week}:${w.duration_minutes}/${CAP[w.day_of_week] * 60}`).join(' '));
check('Over-cap Saturday ride clamped to 300min', all.find((w) => w.day_of_week === 6)?.duration_minutes === 300);
check('Invalid workout_type coerced to a valid type', all.every((w) => VALID.has(w.workout_type)));
// The workouts table CHECK constraint (after migration 036) allows this set.
// Any value outside it MUST be coerced before insert or the build dies.
const DB_ALLOWED = new Set(['endurance', 'tempo', 'threshold', 'sweet_spot', 'vo2max', 'anaerobic', 'sprint', 'recovery', 'custom']);
check('Every workout_type is DB-insertable',
  all.every((w) => DB_ALLOWED.has(w.workout_type)),
  [...new Set(all.map((w) => w.workout_type))].join(','));
check('sweet_spot kept as a first-class type', all.find((w) => w.day_of_week === 1)?.workout_type === 'sweet_spot');
check('anaerobic kept as a first-class type', all.find((w) => w.day_of_week === 3)?.workout_type === 'anaerobic');
check('One workout per day per week (dup Tuesday removed)', plan.weeks.every((w) => new Set(w.workouts.map((x) => x.day_of_week)).size === w.workouts.length));
check('Every workout has synthesized intervals', all.every((w) => Array.isArray(w.intervals) && w.intervals.length > 0));
check('Intervals sum to the workout duration', all.every((w) => {
  const sum = w.intervals.reduce((s: number, iv: any) => s + (iv.duration || 0), 0);
  return Math.abs(sum - w.duration_minutes * 60) <= 1;
}));

// Garbage input must throw (so the caller falls back to deterministic).
let threwEmpty = false;
try { normalizeAiPlan([], availableDays, { goal_event: 'x', eventIso: '2026-09-12', startIso: '2026-06-15', athleteId: 'a' }); }
catch { threwEmpty = true; }
check('Throws on empty plan (triggers deterministic fallback)', threwEmpty);

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
