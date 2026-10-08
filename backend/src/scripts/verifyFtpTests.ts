/**
 * FTP tests end to end (minus Strava): plans schedule real 20-min tests, the
 * test exports as a free ride (never ERG-locked), and a synced test ride sets
 * FTP = 95% of the best 20 minutes — with guards for skipped / bad tests.
 *
 * Run: npm run test:ftp
 */
import { buildFtpTestWorkout, scheduleFtpTests, isFtpTestWorkout, buildIntervalsForType } from '../services/trainingPlanService';
import { decideFtpFromTest, ftpTestService, FTP_TEST_NOTE_PREFIX } from '../services/ftpTestService';
import { zwoGenerator } from '../services/fileGenerators/zwoGenerator';
import { fitGenerator } from '../services/fileGenerators/fitGenerator';
import { generateWahooPlan } from '../services/wahooPlanGenerator';
import { supabaseAdmin } from '../utils/supabase';
import { TrainingWeek } from '../types/trainingPlan';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

(async () => {
  // ---- The test workout ----
  const adv = buildFtpTestWorkout(2, 'advanced');
  const beg = buildFtpTestWorkout(2, 'beginner');
  const block = adv.intervals.find((iv: any) => iv.ftp_test);
  check('Test has a 20-min open test block', block?.duration === 1200 && block?.open === true);
  check('Intervals sum to the stated duration', adv.intervals.reduce((s: number, iv: any) => s + iv.duration, 0) === adv.duration_minutes * 60, `${adv.duration_minutes} min`);
  check('Beginner test skips the 5-min opener (shorter)', beg.duration_minutes < adv.duration_minutes, `${beg.duration_minutes} vs ${adv.duration_minutes} min`);
  check('Stored as a DB-valid type and detectable', adv.workout_type === 'custom' && isFtpTestWorkout(adv));

  // ---- Exports never ERG-lock max efforts ----
  const asWorkout = (w: any) => ({ ...w, id: 'w', athlete_id: 'a' }) as any;
  const zwo = zwoGenerator.generate(asWorkout(adv), 300);
  check('ZWO: test block is a FreeRide', /<FreeRide Duration="1200"/.test(zwo));
  const sprintZwo = zwoGenerator.generate(asWorkout({ name: 's', description: '', workout_type: 'sprint', duration_minutes: 60, intervals: buildIntervalsForType('sprint', 60, 'advanced') }), 300);
  check('ZWO: sprints are FreeRide', /<FreeRide Duration="15"/.test(sprintZwo));
  const steps: any[] = [];
  fitGenerator.writeWorkoutStep({ writeMessage: (_: string, r: any) => steps.push(r) } as any, 0, block as any, 300);
  check('FIT: test block has an open target', steps[0]?.target_type === 'open');
  const wahoo = generateWahooPlan(asWorkout(adv), 300);
  check('Wahoo: test block band is wide (not ±2%)', /PERCENT_FTP_LO=95\nPERCENT_FTP_HI=200/.test(wahoo));

  // ---- Result decisions ----
  check('No FTP yet → test sets it', decideFtpFromTest(null, 280).commit && decideFtpFromTest(null, 280).testFtp === 266);
  const up = decideFtpFromTest(280, 315);
  check('Stronger → FTP raised to 95% of 20-min', up.commit && up.testFtp === 299 && up.reason === 'ftp_test_raised', `${up.testFtp}W`);
  const small = decideFtpFromTest(300, 305);
  check('Slightly lower → honest small drop committed', small.commit && small.testFtp === 290, `${small.testFtp}W`);
  const big = decideFtpFromTest(300, 280);
  check('Much lower (>5%) → held for the coach', !big.commit && big.reason === 'ftp_test_suspect_low');
  const skipped = decideFtpFromTest(300, 220);
  check('Easy ride on test day → ignored', !skipped.commit && skipped.reason === 'ftp_test_not_completed');

  // ---- Scheduling ----
  const mk = (n: number, phase: any, minsScale: number, notes?: string): TrainingWeek => ({
    week_number: n, phase, tss: 0, notes,
    workouts: [
      { name: 'Threshold', description: '', workout_type: 'threshold', duration_minutes: Math.round(90 * minsScale), day_of_week: 2, intervals: [] },
      { name: 'End', description: '', workout_type: 'endurance', duration_minutes: Math.round(60 * minsScale), day_of_week: 3, intervals: [] },
      { name: 'Tempo', description: '', workout_type: 'tempo', duration_minutes: Math.round(90 * minsScale), day_of_week: 4, intervals: [] },
      { name: 'Long', description: '', workout_type: 'endurance', duration_minutes: Math.round(180 * minsScale), day_of_week: 6, intervals: [] },
    ],
  });
  const weeks = [
    mk(1, 'base', 1), mk(2, 'base', 1.1), mk(3, 'base', 1.2), mk(4, 'base', 0.6, 'Recovery week'),
    mk(5, 'build', 1.1), mk(6, 'build', 1.2), mk(7, 'build', 0.6, 'Recovery week'),
    mk(8, 'build', 1.1), mk(9, 'peak', 1.2), mk(10, 'taper', 0.5),
  ];
  scheduleFtpTests(weeks, new Map([[2, 2], [3, 1.5], [4, 2], [6, 4]]), 'intermediate');
  const testWeeks = weeks.filter((w) => w.workouts.some(isFtpTestWorkout)).map((w) => w.week_number);
  check('Tests in week 1 and after each recovery week (≥4 wks apart)', JSON.stringify(testWeeks) === '[1,5]', `weeks ${testWeeks}`);
  const wk1Test = weeks[0].workouts.find(isFtpTestWorkout);
  check('Test replaces a quality day, not the long ride', wk1Test?.day_of_week === 2);
  check('No tests in peak/taper', !weeks.slice(8).some((w) => w.workouts.some(isFtpTestWorkout)));

  // Regression: quality days as long as the long ride (Brandon's plan) — the
  // test used to land on easy Monday, making 4 hard days in a row.
  const q = (day: number, type: string, mins: number) => ({ name: type, description: '', workout_type: type, duration_minutes: mins, day_of_week: day, intervals: [] });
  const tie: TrainingWeek[] = [{ week_number: 1, phase: 'build', tss: 0, workouts: [
    q(1, 'endurance', 90), q(2, 'vo2max', 120), q(3, 'threshold', 90), q(4, 'threshold', 120), q(5, 'endurance', 60), q(6, 'endurance', 120),
  ] }];
  scheduleFtpTests(tie, new Map([[1, 1.5], [2, 2], [3, 1.5], [4, 2], [5, 1], [6, 2]]), 'advanced');
  const tieTest = tie[0].workouts.find(isFtpTestWorkout);
  const qDays = tie[0].workouts.filter((x) => isFtpTestWorkout(x) || ['vo2max', 'threshold'].includes(x.workout_type)).length;
  check('Duration tie: test replaces a quality day (no extra hard day)', !!tieTest && tieTest.day_of_week !== 1 && qDays === 3, `test on d${tieTest?.day_of_week}`);

  // ---- Processing a synced test ride (DB mocked) ----
  const updates: { table: string; data: any }[] = [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
  const rows: Record<string, any> = {
    athletes: { ftp: 280, timezone: 'America/Denver' },
    calendar_entries: [{ id: 'e1', scheduled_date: today, notes: null, workouts: { intervals: adv.intervals } }],
    strava_activities: [{ strava_activity_id: 111, start_date: new Date().toISOString() }],
    power_curves: [{ strava_activity_id: 111, power_20min: 315 }],
  };
  (supabaseAdmin as any).from = (table: string) => {
    const b: any = {
      select: () => b, eq: () => b, gte: () => b, lte: () => b, in: () => b, order: () => b,
      single: async () => ({ data: rows[table], error: null }),
      update: (data: any) => { updates.push({ table, data }); return { eq: () => ({ eq: async () => ({ error: null }), then: (r: any) => r({ error: null }) }) }; },
      then: (resolve: any) => resolve({ data: rows[table], error: null }),
    };
    return b;
  };
  const res = await ftpTestService.applyPendingFtpTests('a');
  const athleteUpd = updates.find((u) => u.table === 'athletes')?.data;
  const entryUpd = updates.find((u) => u.table === 'calendar_entries')?.data;
  check('Synced test ride → FTP committed', res?.committed === true && athleteUpd?.ftp === 299, `ftp=${athleteUpd?.ftp}`);
  check('Calendar entry annotated + completed', entryUpd?.completed === true && (entryUpd?.notes || '').startsWith(FTP_TEST_NOTE_PREFIX), entryUpd?.notes);

  rows.calendar_entries[0].notes = entryUpd?.notes;
  updates.length = 0;
  const again = await ftpTestService.applyPendingFtpTests('a');
  check('Idempotent: already-processed test is not re-applied', again === null && updates.length === 0);

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
