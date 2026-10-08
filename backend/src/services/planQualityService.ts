/**
 * Plan-quality grader. Pure: takes a built TrainingPlan + who it's for, returns
 * a scorecard of coaching-rule checks. It grades against the SAME numbers the
 * generators are told to follow (LEVEL_PROFILES), so "legit" is measured, not
 * asserted.
 *
 * Severity:
 *  - critical: a real coach would reject the plan (over-cap rides, too many
 *    quality days for the level, Z1 junk inside a quality day, oversize sessions)
 *  - warn: questionable / worth a look, not disqualifying
 */
import { TrainingPlan, WorkoutTemplate } from '../types/trainingPlan';
import { Level, LEVEL_PROFILES, recoveryRideAllowance } from '../utils/coachingLevels';
import { describeIntervals } from './trainingPlanService';
import { isFtpTestWorkout } from '../utils/ftpTest';

export type Severity = 'critical' | 'warn';

export interface Finding {
  rule: string;
  severity: Severity;
  pass: boolean;
  detail: string;
}

export interface GradeContext {
  level: Level;
  intensityPreference?: string | null;
  /** hours per weekday, 0 = Sunday … 6 = Saturday; 0/undefined = unavailable */
  capByDay: Record<number, number>;
  /** e.g. 'stage_race' | 'crit' | 'gran_fondo' — enables specificity checks */
  eventKind?: string;
  /** Current CTL — enables the load-ramp check. */
  ctl?: number | null;
  /** Athlete wants real FTP tests (default) — enables the test-cadence check. */
  ftpTesting?: boolean;
  /** Limiter the event demands — the plan should prioritize it in build/peak. */
  expectEmphasis?: 'vo2max' | 'sprint';
}

const QUALITY_TYPES = new Set(['threshold', 'sweet_spot', 'vo2max', 'anaerobic', 'tempo', 'sprint']);
/** Z1 = below 56% FTP (Coggan). */
const Z1_MAX = 55;
/** Power at/above which a 'work' block counts as intensity (Z3+). */
const INTENSITY_MIN = 76;

const totalSec = (w: WorkoutTemplate) => (w.intervals || []).reduce((s, iv: any) => s + (iv.duration || 0), 0);
const isQuality = (w: WorkoutTemplate) => QUALITY_TYPES.has(w.workout_type) || isFtpTestWorkout(w);
const isLong = (w: WorkoutTemplate, weekWorkouts: WorkoutTemplate[]) =>
  w.workout_type === 'endurance' && w.duration_minutes === Math.max(...weekWorkouts.map((x) => x.duration_minutes)) && w.duration_minutes >= 120;
const isZ1Ride = (w: WorkoutTemplate) =>
  w.workout_type === 'recovery' ||
  (w.workout_type === 'endurance' && (w.intervals || []).some((iv: any) => iv.type === 'work' && iv.power <= Z1_MAX && iv.duration >= 600));

/** Minutes of real interval work (excludes the Z2 endurance fill). */
function workMinutes(w: WorkoutTemplate): number {
  return (w.intervals || [])
    .filter((iv: any) => iv.type === 'work' && !iv.endurance && iv.power >= INTENSITY_MIN)
    .reduce((s, iv: any) => s + iv.duration, 0) / 60;
}

/** Longest run of consecutive calendar days satisfying `pred`. */
function longestRun(days: number[]): number {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  let best = 0, run = 0, prev = -99;
  for (const d of sorted) { run = d === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}

export function gradePlan(plan: TrainingPlan, ctx: GradeContext): Finding[] {
  const p = LEVEL_PROFILES[ctx.level];
  const allowance = recoveryRideAllowance(ctx.level, ctx.intensityPreference);
  const out: Finding[] = [];
  const add = (rule: string, severity: Severity, bad: string[], okDetail = 'ok') =>
    out.push({ rule, severity, pass: bad.length === 0, detail: bad.length ? bad.slice(0, 4).join('; ') + (bad.length > 4 ? ` (+${bad.length - 4} more)` : '') : okDetail });

  const weekMin = plan.weeks.map((w) => w.workouts.reduce((s, x) => s + x.duration_minutes, 0));
  const peakVol = Math.max(...weekMin);
  // A recovery week = clearly lighter than the recent loading weeks.
  const isRecoveryWeek = plan.weeks.map((w, i) => {
    if (w.phase === 'taper') return false;
    const prev = weekMin.slice(Math.max(0, i - 3), i);
    return prev.length > 0 && weekMin[i] < 0.8 * Math.max(...prev);
  });
  const loading = plan.weeks.filter((w, i) => w.phase !== 'taper' && !isRecoveryWeek[i]);

  // ---- Availability (the hard guarantee) ----
  const overCap: string[] = [];
  for (const w of plan.weeks) for (const x of w.workouts) {
    const cap = (ctx.capByDay[x.day_of_week] || 0) * 60;
    if (x.duration_minutes > cap) overCap.push(`wk${w.week_number} d${x.day_of_week} ${x.duration_minutes}>${cap}min`);
  }
  add('Every ride fits that day\'s available time', 'critical', overCap);

  // ---- Interval integrity ----
  const sumBad: string[] = [];
  const nameBad: string[] = [];
  for (const w of plan.weeks) for (const x of w.workouts) {
    if (Math.abs(totalSec(x) - x.duration_minutes * 60) > 60) sumBad.push(`wk${w.week_number} ${x.name}: ${Math.round(totalSec(x) / 60)}≠${x.duration_minutes}min`);
    const s = describeIntervals(x.intervals);
    if (s && !isFtpTestWorkout(x) && !x.name.includes(s)) nameBad.push(`wk${w.week_number} "${x.name}" vs actual "${s}"`);
  }
  add('Intervals sum to the workout duration', 'critical', sumBad);
  add('Workout name matches its actual intervals', 'critical', nameBad);

  // ---- Frequency ----
  const daysBad: string[] = [];
  for (const w of loading) {
    const n = new Set(w.workouts.map((x) => x.day_of_week)).size;
    if (n > p.ridingDaysPerWeek[1]) daysBad.push(`wk${w.week_number}: ${n} days (max ${p.ridingDaysPerWeek[1]})`);
  }
  add(`Riding days ≤ ${p.ridingDaysPerWeek[1]}/wk (${ctx.level})`, 'critical', daysBad);

  const qHigh: string[] = [], qLow: string[] = [];
  for (const w of loading) {
    const q = w.workouts.filter(isQuality).length;
    if (q > p.qualityPerWeek[1]) qHigh.push(`wk${w.week_number} (${w.phase}): ${q}`);
    if (q < p.qualityPerWeek[0] && w.phase !== 'base') qLow.push(`wk${w.week_number} (${w.phase}): ${q}`);
  }
  add(`Quality sessions ≤ ${p.qualityPerWeek[1]}/loading wk`, 'critical', qHigh);
  add(`Quality sessions ≥ ${p.qualityPerWeek[0]}/loading wk (build/peak)`, 'warn', qLow);

  // ---- Spacing / stacking (absolute day index handles week wrap) ----
  const qDays: number[] = [], hardDays: number[] = [];
  plan.weeks.forEach((w, wi) => w.workouts.forEach((x) => {
    const abs = wi * 7 + x.day_of_week;
    if (isQuality(x)) qDays.push(abs);
    if (isQuality(x) || isLong(x, w.workouts)) hardDays.push(abs);
  }));
  const stack = longestRun(qDays);
  add(`Consecutive quality days ≤ ${p.maxStackedQuality}`, 'critical',
    stack > p.maxStackedQuality ? [`found ${stack} in a row`] : [], `max run ${stack}`);
  if (p.minHoursBetweenQuality >= 48) {
    const hardRun = longestRun(hardDays);
    add('Hard days (quality or long) never back-to-back', 'warn', hardRun > 1 ? [`found ${hardRun} in a row`] : []);
  }

  // ---- Easy days: Z2 by default, Z1 is a deliberate tool ----
  // A Z1 ride straight after a 2+ day quality block is the tool doing its job
  // (e.g. a stage-race Tue/Wed/Thu block → Fri recovery) — it doesn't count.
  const qualityAbs = new Set<number>();
  plan.weeks.forEach((w, wi) => w.workouts.forEach((x) => { if (isQuality(x)) qualityAbs.add(wi * 7 + x.day_of_week); }));
  const afterBlock = (wi: number, x: WorkoutTemplate) => {
    const abs = wi * 7 + x.day_of_week;
    return qualityAbs.has(abs - 1) && qualityAbs.has(abs - 2);
  };
  const recBad: string[] = [];
  for (const w of loading) {
    const wi = plan.weeks.indexOf(w);
    const z1 = w.workouts.filter((x) => isZ1Ride(x) && !afterBlock(wi, x)).length;
    if (z1 > allowance) recBad.push(`wk${w.week_number} (${w.phase}): ${z1} Z1 rides (allow ${allowance})`);
  }
  add(`Z1 recovery rides ≤ ${allowance}/loading wk`, 'critical', recBad);

  const junk: string[] = [];
  for (const w of plan.weeks) for (const x of w.workouts) {
    if (!isQuality(x) || isFtpTestWorkout(x)) continue; // a test's post-opener spin is protocol
    const ivs = x.intervals || [];
    ivs.forEach((iv: any, i: number) => {
      const inner = i > 0 && i < ivs.length - 1;
      if (inner && iv.power <= Z1_MAX && iv.duration >= 600) junk.push(`wk${w.week_number} ${x.name}: ${Math.round(iv.duration / 60)}min @ ${iv.power}%`);
    });
  }
  add('No long Z1 blocks inside quality sessions', 'critical', junk);

  // ---- Session size ----
  const big: string[] = [];
  for (const w of plan.weeks) for (const x of w.workouts) {
    const cap = p.maxWorkMinutes[x.workout_type];
    const wm = workMinutes(x);
    if (cap != null && wm > cap + 0.5) big.push(`wk${w.week_number} ${x.name}: ${Math.round(wm)}min work > ${cap}`);
  }
  add('Work minutes within the level\'s session ceiling', 'critical', big);

  // ---- Intensity distribution (~80/20 by time) ----
  // Time-crunched riders (<8h) legitimately carry a bigger intensity share —
  // low-volume plans from TrainerRoad et al. run ~30–35%.
  const weeklyHours = Object.values(ctx.capByDay).reduce((s, h) => s + Number(h || 0), 0);
  const maxShare = weeklyHours < 8 ? 0.35 : 0.25;
  const distBad: string[] = [];
  for (const w of loading) {
    const total = w.workouts.reduce((s, x) => s + x.duration_minutes, 0);
    const hard = w.workouts.reduce((s, x) => s + workMinutes(x), 0);
    if (total > 0 && hard / total > maxShare) distBad.push(`wk${w.week_number}: ${Math.round((hard / total) * 100)}% at Z3+`);
  }
  add(`≤${Math.round(maxShare * 100)}% of weekly time at Z3+`, 'warn', distBad);

  // ---- Periodization ----
  let run = 0, worst = 0;
  plan.weeks.forEach((w, i) => {
    if (w.phase === 'taper') return;
    run = isRecoveryWeek[i] ? 0 : run + 1;
    worst = Math.max(worst, run);
  });
  const maxLoading = p.recoveryWeekEvery - 1;
  // Peak weeks legitimately run straight into the taper; allow +1.
  add(`Recovery week at least every ${p.recoveryWeekEvery} wks`, 'warn',
    worst > maxLoading + 1 ? [`${worst} loading weeks in a row (target ≤${maxLoading})`] : [], `longest loading run ${worst}`);

  const last = weekMin[weekMin.length - 1];
  const taperOk = plan.weeks.some((w) => w.phase === 'taper') && last <= 0.7 * peakVol;
  add('Taper: final week ≤70% of peak volume', 'critical', taperOk ? [] : [`final ${last}min vs peak ${peakVol}min`]);
  const taperQ = plan.weeks.filter((w) => w.phase === 'taper').every((w) => w.workouts.some(isQuality));
  add('Taper keeps some intensity', 'warn', taperQ ? [] : ['a taper week has no quality session']);

  // Long ride on the biggest available day.
  const maxCap = Math.max(...Object.values(ctx.capByDay).map(Number));
  const longBad: string[] = [];
  for (const w of loading) {
    const longest = [...w.workouts].sort((a, b) => b.duration_minutes - a.duration_minutes)[0];
    if (longest && (ctx.capByDay[longest.day_of_week] || 0) < maxCap) longBad.push(`wk${w.week_number}: longest ride on d${longest.day_of_week}`);
  }
  add('Longest ride lands on the day with the most time', 'warn', longBad);

  // ---- Load ramp vs current fitness ----
  // CTL moves ~ (weeklyTSS/7 − CTL)/6 per week. Sustained ramps above ~5/wk
  // (beginner) or ~8/wk (others) are where riders get hurt or burn out.
  if (ctx.ctl != null) {
    const maxRamp = ctx.level === 'beginner' ? 5 : 8;
    let ctl = ctx.ctl;
    const rampBad: string[] = [];
    for (const w of plan.weeks) {
      const delta = (w.tss / 7 - ctl) / 6;
      if (delta > maxRamp) rampBad.push(`wk${w.week_number}: +${delta.toFixed(1)} CTL (${w.tss} TSS from CTL ${Math.round(ctl)})`);
      ctl += delta;
    }
    add(`Fitness ramp ≤ ${maxRamp} CTL/wk`, 'warn', rampBad);
  }

  // ---- FTP tests: without them FTP stalls and the targets stop moving ----
  if (ctx.ftpTesting) {
    const testWeeks = plan.weeks.map((w, i) => (w.workouts.some(isFtpTestWorkout) ? i : -1)).filter((i) => i >= 0);
    const trainingWeeks = plan.weeks.filter((w) => w.phase === 'base' || w.phase === 'build').length;
    const bad: string[] = [];
    if (!testWeeks.length || testWeeks[0] > 1) bad.push('no baseline test in weeks 1–2');
    if (trainingWeeks >= 10 && testWeeks.length < 2) bad.push(`only ${testWeeks.length} test(s) across ${trainingWeeks} base/build weeks`);
    add('FTP tested at baseline and re-tested each block', 'critical', bad, `tests in weeks ${testWeeks.map((i) => i + 1).join(', ')}`);
    const gaps: string[] = [];
    for (let k = 1; k < testWeeks.length; k++) if (testWeeks[k] - testWeeks[k - 1] < 3) gaps.push(`wk${testWeeks[k - 1] + 1}→wk${testWeeks[k] + 1}`);
    add('FTP tests ≥3 weeks apart', 'warn', gaps);
  }

  // ---- Progression: between tests, the WORK must grow inside each block ----
  // Hours ramping isn't enough — 3×10 should become 3×12/3×15. Measured as
  // total quality work minutes (excl. tests) across consecutive loading weeks
  // of the same phase.
  const progBad: string[] = [];
  let block: { wk: number; work: number }[] = [];
  const flush = () => {
    if (block.length >= 2 && block[block.length - 1].work <= block[0].work) {
      progBad.push(`wk${block[0].wk}–${block[block.length - 1].wk}: ${Math.round(block[0].work)}→${Math.round(block[block.length - 1].work)} work min`);
    }
    block = [];
  };
  plan.weeks.forEach((w, i) => {
    const loadingWeek = (w.phase === 'base' || w.phase === 'build') && !isRecoveryWeek[i];
    if (!loadingWeek || (block.length && plan.weeks[i - 1].phase !== w.phase)) flush();
    if (!loadingWeek) return;
    const work = w.workouts.filter((x) => isQuality(x) && !isFtpTestWorkout(x)).reduce((s, x) => s + workMinutes(x), 0);
    block.push({ wk: w.week_number, work });
  });
  flush();
  add('Quality work progresses within each block', 'warn', progBad);

  // ---- Targets the limiter the event demands ----
  if (ctx.expectEmphasis) {
    const groups = { vo2max: ['vo2max'], sprint: ['sprint', 'anaerobic'] };
    const late = plan.weeks.filter((w) => w.phase === 'build' || w.phase === 'peak');
    const q = late.flatMap((w) => w.workouts.filter((x) => isQuality(x) && !isFtpTestWorkout(x)));
    const targetPattern = ctx.expectEmphasis === 'vo2max' ? /VO2max/ : /Sprint|Anaerobic/;
    // Name-based: DB types collapse (e.g. sprint stores as 'sprint', sweet_spot as 'threshold').
    const hits = q.filter((x) => groups[ctx.expectEmphasis!].includes(x.workout_type) || targetPattern.test(x.name)).length;
    const share = q.length ? hits / q.length : 0;
    add(`Prioritizes the event-relevant limiter (${ctx.expectEmphasis})`, 'warn',
      hits >= 2 && share >= 0.2 ? [] : [`${hits}/${q.length} build/peak quality sessions (${Math.round(share * 100)}%)`],
      `${hits}/${q.length} sessions (${Math.round(share * 100)}%)`);
  }

  // ---- Fueling on long sessions ----
  const unfueled: string[] = [];
  for (const w of plan.weeks) for (const x of w.workouts) {
    if (x.duration_minutes >= 90 && !/Fuel:/.test(x.description || '')) unfueled.push(`wk${w.week_number} ${x.name} (${x.duration_minutes}min)`);
  }
  add('Sessions ≥90 min carry fueling guidance', 'warn', unfueled);

  // ---- Event specificity ----
  if (ctx.eventKind === 'stage_race') {
    const lateWeeks = plan.weeks.filter((w) => w.phase === 'build' || w.phase === 'peak');
    const hasBlock = lateWeeks.some((w) => {
      const days = w.workouts.filter((x) => isQuality(x) || isLong(x, w.workouts)).map((x) => x.day_of_week);
      return longestRun(days) >= 2;
    });
    add('Stage race: back-to-back hard days in build/peak', 'warn', hasBlock ? [] : ['no 2+ day hard block anywhere in build/peak']);
  }
  if (['crit', 'stage_race', 'road_race'].includes(ctx.eventKind || '') && ctx.level !== 'beginner') {
    const late = plan.weeks.filter((w) => w.phase === 'build' || w.phase === 'peak');
    const raceSpecific = /over-unders|30\/30s|surges|end of the ride/;
    const has = late.some((w) => w.workouts.some((x) => raceSpecific.test(x.name)));
    add('Racer: race-specific sessions (over-unders / 30-30s / surges / late efforts)', 'warn', has ? [] : ['only standard steady reps in build/peak']);
  }
  if (ctx.eventKind === 'crit' || ctx.eventKind === 'stage_race') {
    const peak = plan.weeks.filter((w) => w.phase === 'peak' || w.phase === 'build');
    const has = peak.some((w) => w.workouts.some((x) => ['vo2max', 'anaerobic', 'sprint'].includes(x.workout_type)));
    add('Race with surges: VO2/anaerobic/sprint work before the event', 'warn', has ? [] : ['none in build/peak']);
  }

  return out;
}

export function summarize(findings: Finding[]) {
  const failedCritical = findings.filter((f) => !f.pass && f.severity === 'critical');
  const failedWarn = findings.filter((f) => !f.pass && f.severity === 'warn');
  return { failedCritical, failedWarn, score: Math.round((findings.filter((f) => f.pass).length / findings.length) * 100) };
}
