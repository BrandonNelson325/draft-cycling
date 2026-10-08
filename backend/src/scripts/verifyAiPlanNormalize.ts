/**
 * Proves the safety net around the Opus plan designer: no matter what the model
 * returns, normalizeAiPlan produces a plan that respects the athlete's
 * availability and is always schedulable. This is what makes "AI designs the
 * plan" reliable — we never trust the model's output blindly.
 *
 * Run: npm run test:ai-plan
 */
import { availableDaysFromDailyHours, normalizeAiPlan, buildWorkoutFromSpec, buildIntervalsForType } from '../services/trainingPlanService';

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

// ---- Level invariants: the exact failures the plan-quality eval caught from Opus ----
const everyDay = availableDaysFromDailyHours({ monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 2, sunday: 1 });
const meta = { goal_event: 'fondo', eventIso: '2026-09-12', startIso: '2026-06-15', athleteId: 'a', level: 'beginner' as const };
const beginnerPlan = normalizeAiPlan([
  { phase: 'build', workouts: [
    { day_of_week: 0, workout_type: 'endurance', duration_minutes: 60 },
    { day_of_week: 1, workout_type: 'recovery', duration_minutes: 40 },
    { day_of_week: 2, workout_type: 'threshold', duration_minutes: 60 },
    { day_of_week: 3, workout_type: 'endurance', duration_minutes: 50 },
    { day_of_week: 4, workout_type: 'endurance', duration_minutes: 60 },
    { day_of_week: 5, workout_type: 'endurance', duration_minutes: 45 },
    { day_of_week: 6, workout_type: 'tempo', duration_minutes: 120 },
  ] },
  // Sat tempo (week 1) → Sun VO2 (week 2): stacked across the week boundary.
  { phase: 'build', workouts: [
    { day_of_week: 0, workout_type: 'vo2max', duration_minutes: 60 },
    { day_of_week: 2, workout_type: 'threshold', duration_minutes: 60 },
    { day_of_week: 6, workout_type: 'endurance', duration_minutes: 120 },
  ] },
], everyDay, meta);
const w1 = beginnerPlan.weeks[0].workouts;
check('Beginner: riding days capped at 5', w1.length === 5, `${w1.length} days`);
check('Beginner: recovery ride dropped before quality', !w1.some((x) => x.workout_type === 'recovery') && w1.filter((x) => ['threshold', 'tempo'].includes(x.workout_type)).length === 2);
const sun2 = beginnerPlan.weeks[1].workouts.find((x) => x.day_of_week === 0);
check('Beginner: quality stacked across week boundary → demoted to endurance', sun2?.workout_type === 'endurance', sun2?.workout_type);
const advPlan = normalizeAiPlan([{ phase: 'build', workouts: [
  { day_of_week: 2, workout_type: 'threshold', duration_minutes: 60 },
  { day_of_week: 3, workout_type: 'vo2max', duration_minutes: 60 },
  { day_of_week: 4, workout_type: 'sweet_spot', duration_minutes: 60 },
] }], everyDay, { ...meta, level: 'advanced' });
check('Advanced: deliberate 3-day block is kept', advPlan.weeks[0].workouts.every((x) => x.workout_type !== 'endurance'));

// ---- Sprints: used to silently become a 70% "Endurance Ride" ----
const sprintSpec = buildWorkoutFromSpec({ workout_type: 'sprint', duration_minutes: 75, day_of_week: 2, reps: 8, work_minutes: 0.25, rest_minutes: 5 }, 'advanced');
check('Sprint (structured) → real 8 × 15s max sprints', /8 × 15 sec @ 200%/.test(sprintSpec.name), sprintSpec.name);
const sprintDefault = buildIntervalsForType('sprint', 60, 'intermediate');
const sprintReps = sprintDefault.filter((iv: any) => iv.type === 'work' && !iv.endurance);
check('Sprint (default) → short maximal reps, not a steady ride', sprintReps.length >= 4 && sprintReps.every((iv: any) => iv.duration <= 20 && iv.power >= 150), `${sprintReps.length} reps`);
const beginnerSprint = buildWorkoutFromSpec({ workout_type: 'sprint', duration_minutes: 90, day_of_week: 2, reps: 15, work_minutes: 0.25, rest_minutes: 4 }, 'beginner');
check('Beginner sprint volume clamped (≤1.5 min of sprinting)', /^Sprint Efforts · 6 × 15 sec/.test(beginnerSprint.name), beginnerSprint.name);

// ---- Opus over-prescribing: quality cap + Z1 allowance enforced in code ----
const loadWeek = (workouts: any[]) => ({ phase: 'build', workouts });
const capPlan = normalizeAiPlan([
  loadWeek([{ day_of_week: 2, workout_type: 'vo2max', duration_minutes: 60 }, { day_of_week: 3, workout_type: 'endurance', duration_minutes: 60 },
    { day_of_week: 4, workout_type: 'anaerobic', duration_minutes: 60 }, { day_of_week: 6, workout_type: 'sprint', duration_minutes: 120 }]),
], everyDay, { ...meta, level: 'beginner' });
const capQ = capPlan.weeks[0].workouts.filter((x) => ['vo2max', 'anaerobic', 'sprint'].includes(x.workout_type)).length;
check('Beginner: 3 quality sessions → capped at 2', capQ === 2, `${capQ}`);
const z1Plan = normalizeAiPlan([
  loadWeek([{ day_of_week: 1, workout_type: 'recovery', duration_minutes: 60 }, { day_of_week: 2, workout_type: 'threshold', duration_minutes: 60 },
    { day_of_week: 3, workout_type: 'endurance', duration_minutes: 60 }, { day_of_week: 4, workout_type: 'vo2max', duration_minutes: 60 },
    { day_of_week: 5, workout_type: 'recovery', duration_minutes: 50 }, { day_of_week: 6, workout_type: 'endurance', duration_minutes: 120 }]),
], everyDay, { ...meta, level: 'advanced', intensityPreference: 'prefers-volume' });
const z1Left = z1Plan.weeks[0].workouts.filter((x) => x.workout_type === 'recovery').length;
check('Advanced prefers-volume: Z1 rides beyond allowance → Z2', z1Left === 0, `${z1Left} left`);

// ---- Race-specific formats ----
const sumSec = (ivs: any[]) => ivs.reduce((t, iv) => t + iv.duration, 0);
const ou = buildWorkoutFromSpec({ workout_type: 'threshold', duration_minutes: 90, day_of_week: 2, reps: 3, work_minutes: 9, rest_minutes: 4, format: 'over_under' }, 'advanced');
check('Over-unders: named + real 2′/1′ alternation', /3 × 9 min over-unders \(95\/108%\)/.test(ou.name) && ou.intervals.some((iv: any) => iv.power === 108 && iv.duration === 60), ou.name);
check('Over-unders: sums to duration', sumSec(ou.intervals) === 90 * 60);
const micro = buildWorkoutFromSpec({ workout_type: 'vo2max', duration_minutes: 75, day_of_week: 2, reps: 3, work_minutes: 8, rest_minutes: 5, format: 'micro' }, 'intermediate');
check('30/30s: sets of 30s @ 120%', /3 × 8 min of 30\/30s @ 120%/.test(micro.name) && micro.intervals.filter((iv: any) => iv.power === 120).length === 24, micro.name);
const late = buildWorkoutFromSpec({ workout_type: 'sprint', duration_minutes: 120, day_of_week: 6, reps: 6, work_minutes: 0.25, rest_minutes: 4, format: 'late' }, 'advanced');
const fillIdx = late.intervals.findIndex((iv: any) => iv.endurance);
const firstSprint = late.intervals.findIndex((iv: any) => iv.open);
check('Late sprints: aerobic block FIRST, sprints at the end', fillIdx > 0 && firstSprint > fillIdx, late.name);
const begOu = buildWorkoutFromSpec({ workout_type: 'threshold', duration_minutes: 90, day_of_week: 2, reps: 4, work_minutes: 12, format: 'over_under' }, 'beginner');
check('Formats respect the level work ceiling (beginner ≤25 min threshold)', /^Threshold Intervals · 2 × 12 min over-unders/.test(begOu.name), begOu.name);
const badFmt = buildWorkoutFromSpec({ workout_type: 'endurance', duration_minutes: 90, day_of_week: 2, format: 'over_under' }, 'advanced');
check('Format on a type it does not fit → ignored safely', badFmt.name === 'Endurance Ride');
const sprintKept = normalizeAiPlan([{ phase: 'peak', workouts: [{ day_of_week: 2, workout_type: 'sprint', duration_minutes: 60, reps: 8, work_minutes: 0.25 }] }], everyDay, { ...meta, level: 'advanced' });
check('normalizeAiPlan keeps sprint sessions (was coerced to endurance)', /Sprint Efforts/.test(sprintKept.weeks[0].workouts[0].name), sprintKept.weeks[0].workouts[0].name);

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
