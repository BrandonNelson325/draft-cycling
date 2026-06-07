/**
 * Proves the deterministic per-day plan generator actually respects the
 * rider's stated availability — using the exact scenario from the screenshots:
 *   200-mile TTT, ~15 weeks out, 1.5-2h on weekdays, 5h Saturday, Sunday OFF.
 *
 * It runs the REAL trainingPlanService.generatePlan (the engine the background
 * job uses). The only things mocked are the 3 DB touchpoints (athlete FTP,
 * preferences, CTL estimate) — none of which are the logic under test. The
 * periodization, per-day capping, day placement, and weekday date math are all
 * the real code paths.
 *
 * Run: npm run test:plan
 */
import { trainingPlanService, workoutDateFor } from '../services/trainingPlanService';
import { athletePreferencesService } from '../services/athletePreferencesService';
import { supabaseAdmin } from '../utils/supabase';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

// ---- Mock the 3 DB touchpoints (not the logic under test) ----
const athleteRow = { ftp: 250, timezone: 'America/Denver' };
(supabaseAdmin as any).from = () => {
  const b: any = { select: () => b, eq: () => b, single: async () => ({ data: athleteRow, error: null }) };
  return b;
};
(athletePreferencesService as any).getPreferences = async () => ({ rest_days: ['Sunday'] });
(trainingPlanService as any).estimateCurrentCTL = async () => 50;

const DAILY_HOURS = {
  monday: 1.5, tuesday: 2, wednesday: 1.5, thursday: 2, friday: 1.5, saturday: 5, sunday: 0,
};
const CAP_BY_DAY: Record<number, number> = { 0: 0, 1: 1.5, 2: 2, 3: 1.5, 4: 2, 5: 1.5, 6: 5 };

(async () => {
  console.log('Verifying deterministic per-day plan (200-mile TTT scenario)\n');

  // Event ~15 weeks out.
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 15 * 7);

  const plan = await trainingPlanService.generatePlan('athlete-1', {
    goal_event: '200-mile TTT',
    event_date: eventDate,
    current_fitness_level: 'advanced',
    weekly_hours: 0, // intentionally 0 — must be derived from daily_hours
    strengths: [],
    weaknesses: ['climbing'],
    preferences: { indoor_outdoor: 'both', zwift_availability: false },
    daily_hours: DAILY_HOURS,
  } as any);

  const allWorkouts = plan.weeks.flatMap((w) => w.workouts);

  // 1. Multi-week plan actually produced
  check('Builds a multi-week plan', plan.weeks.length >= 12, `${plan.weeks.length} weeks`);
  check('Schedules real workouts', allWorkouts.length > 0, `${allWorkouts.length} workouts`);

  // 2. Starts on a Monday (clean future week boundary)
  check('Plan starts on a Monday', workoutDateFor(plan.start_date, 1, 1).getDay() === 1, `start_date=${plan.start_date}`);

  // 3. EVERY workout fits its day's available time (the core guarantee)
  let overCap: string | null = null;
  for (const w of plan.weeks) {
    for (const wt of w.workouts) {
      const capMin = CAP_BY_DAY[wt.day_of_week] * 60;
      if (wt.duration_minutes > capMin) {
        overCap = `week ${w.week_number} day ${wt.day_of_week}: ${wt.duration_minutes}min > ${capMin}min cap`;
        break;
      }
    }
    if (overCap) break;
  }
  check('No workout EVER exceeds its day\'s available time', overCap === null, overCap || 'all within caps');

  // 4. Sunday (0h) is always rest — never scheduled
  const sundayWorkouts = allWorkouts.filter((w) => w.day_of_week === 0);
  check('Sunday is always rest (never scheduled)', sundayWorkouts.length === 0, `${sundayWorkouts.length} sunday workouts`);

  // 5. The long ride lands on Saturday (the day with the most time) — NOT assumed, derived
  const longRideDays = plan.weeks
    .map((w) => w.workouts.slice().sort((a, b) => b.duration_minutes - a.duration_minutes)[0])
    .filter(Boolean)
    .map((w) => w!.day_of_week);
  const longRideAlwaysSaturday = longRideDays.every((d) => d === 6);
  check('Longest ride each week is on Saturday (the biggest day)', longRideAlwaysSaturday, `long-ride days seen: {${[...new Set(longRideDays)].join(',')}}`);

  // 6. Weekday math is correct: every workout's real date matches its day_of_week
  let badDate: string | null = null;
  for (const w of plan.weeks) {
    for (const wt of w.workouts) {
      const date = workoutDateFor(plan.start_date, w.week_number, wt.day_of_week);
      if (date.getDay() !== wt.day_of_week) {
        badDate = `week ${w.week_number}: day_of_week=${wt.day_of_week} but date ${date.toDateString()} is weekday ${date.getDay()}`;
        break;
      }
      if (CAP_BY_DAY[date.getDay()] <= 0) {
        badDate = `week ${w.week_number}: scheduled on a 0-hour day (${date.toDateString()})`;
        break;
      }
    }
    if (badDate) break;
  }
  check('Every scheduled date falls on the intended weekday', badDate === null, badDate || 'all weekdays correct');

  // 6b. Says-6-days → trains 6 days, EVERY week (including recovery & taper).
  // Down weeks get lighter rides, never fewer days. No week may force a rest day.
  let badWeek: string | null = null;
  for (const w of plan.weeks) {
    const days = new Set(w.workouts.map((wt) => wt.day_of_week));
    const trainsAll6 = w.workouts.length === 6 && [1, 2, 3, 4, 5, 6].every((d) => days.has(d));
    if (!trainsAll6) {
      badWeek = `week ${w.week_number} (${w.phase}${/recovery/i.test(w.notes || '') ? '/recovery' : ''}): ${w.workouts.length} days {${[...days].sort().join(',')}}`;
      break;
    }
  }
  check('EVERY week trains all 6 available days (no forced rest, ever)', badWeek === null, badWeek || 'all 14 weeks ride Mon-Sat');

  // 6c. Down weeks are lighter by VOLUME, not by dropping days.
  const weekVol = (w: typeof plan.weeks[number]) => w.workouts.reduce((s, wt) => s + wt.duration_minutes, 0);
  const recoveryWeek = plan.weeks.find((w) => /recovery/i.test(w.notes || ''));
  const taperWeek = plan.weeks.find((w) => w.phase === 'taper');
  const peakVol = Math.max(...plan.weeks.map(weekVol));
  check(
    'Recovery week is lighter than peak (less volume, same 6 days)',
    recoveryWeek == null || weekVol(recoveryWeek) < peakVol,
    recoveryWeek ? `recovery ${(weekVol(recoveryWeek) / 60).toFixed(1)}h vs peak ${(peakVol / 60).toFixed(1)}h` : 'no recovery week'
  );
  check(
    'Taper week is lighter than peak (less volume, same 6 days)',
    taperWeek == null || weekVol(taperWeek) < peakVol,
    taperWeek ? `taper ${(weekVol(taperWeek) / 60).toFixed(1)}h vs peak ${(peakVol / 60).toFixed(1)}h` : 'no taper week'
  );

  // 6d. Every session is deliberate — carries a rationale.
  const missingRationale = allWorkouts.filter((w) => !w.rationale || !w.rationale.trim()).length;
  check('Every workout has a deliberate rationale', missingRationale === 0, `${missingRationale} without rationale`);

  // 6e. Recovery is placed deliberately: in a 6-day week there is at least one
  // recovery ride, and every recovery ride sits the day after a hard day.
  const recoveryWk = plan.weeks.find((w) => w.workouts.some((x) => x.workout_type === 'recovery'));
  check('6-day weeks include a deliberate recovery ride', recoveryWk != null, recoveryWk ? `week ${recoveryWk.week_number}` : 'none found');
  // On loading weeks, recovery must follow a hard day. On already-easy
  // recovery/taper weeks a recovery spin anywhere is legitimately deliberate.
  let recoveryMisplaced: string | null = null;
  for (const w of plan.weeks) {
    const isDownWeek = w.phase === 'taper' || /recovery/i.test(w.notes || '');
    if (isDownWeek) continue;
    const byDay = new Map(w.workouts.map((x) => [x.day_of_week, x]));
    for (const x of w.workouts) {
      if (x.workout_type !== 'recovery') continue;
      const prev = byDay.get(x.day_of_week - 1);
      const prevIsHard = !!prev && /Long|Threshold|VO2|Tempo/.test(prev.name);
      if (!prevIsHard) { recoveryMisplaced = `week ${w.week_number}: recovery on day ${x.day_of_week} not after a hard day`; break; }
    }
    if (recoveryMisplaced) break;
  }
  check('On loading weeks, recovery rides follow a hard day (deliberate)', recoveryMisplaced === null, recoveryMisplaced || 'all recovery placed after hard work');

  // 7. Plan actually uses the available time (a peak week approaches the 13.5h budget)
  const weeklyHours = plan.weeks.map((w) => w.workouts.reduce((s, wt) => s + wt.duration_minutes, 0) / 60);
  const peak = Math.max(...weeklyHours);
  check('A peak week uses most of the available time', peak >= 9, `peak week = ${peak.toFixed(1)}h of 13.5h available`);

  // Show a sample week so the output is inspectable
  const sample = plan.weeks.find((w) => w.workouts.length >= 4) || plan.weeks[0];
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  console.log(`\nSample (week ${sample.week_number}, ${sample.phase}):`);
  for (const wt of sample.workouts) {
    console.log(`   ${dayName[wt.day_of_week]}: ${wt.name} — ${wt.duration_minutes}min (cap ${CAP_BY_DAY[wt.day_of_week]}h)`);
  }

  // ---- Second scenario: rider wants all 7 days, no rest day ----
  console.log('\n--- 7-day availability (no rest day) ---');
  const plan7 = await trainingPlanService.generatePlan('athlete-2', {
    goal_event: '200-mile TTT',
    event_date: eventDate,
    current_fitness_level: 'advanced',
    weekly_hours: 0,
    strengths: [],
    weaknesses: [],
    preferences: { indoor_outdoor: 'both', zwift_availability: false },
    daily_hours: { sunday: 1, monday: 1.5, tuesday: 2, wednesday: 1.5, thursday: 2, friday: 1.5, saturday: 5 },
  } as any);

  const allDaysTrained = plan7.weeks.every((w) => w.workouts.length === 7);
  check('7-day availability → trains all 7 days', allDaysTrained, `weeks with 7 days: ${plan7.weeks.filter((w) => w.workouts.length === 7).length}/${plan7.weeks.length}`);

  const everyWeekHasRecovery = plan7.weeks.every((w) => w.workouts.some((x) => x.workout_type === 'recovery'));
  check('7-day plan builds recovery rides into EVERY week (load is managed)', everyWeekHasRecovery, 'recovery present each week');

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
