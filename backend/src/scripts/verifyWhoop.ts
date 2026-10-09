/**
 * WHOOP integration: mapping, webhook signatures, source priority, the coach's
 * Whoop summary, and readiness. Pure/offline — no Whoop or DB calls.
 *
 * Run: npm run test:whoop
 */
import crypto from 'crypto';
import { buildDailyWhoop, localDateTime, isCyclingSport, verifyWhoopSignature } from '../utils/whoopMapping';
import { canWriteWellness } from '../utils/wellnessSource';
import { summarizeWhoop, bandFor } from '../utils/whoopCoaching';
import { dailyReadinessService } from '../services/dailyReadinessService';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

// ---- Day mapping ----
check('Local date uses Whoop offset (late-UTC wake → previous local day)',
  localDateTime('2026-10-09T03:30:00Z', '-06:00').date === '2026-10-08');
check('Local date uses Whoop offset (positive offset rolls forward)',
  localDateTime('2026-10-08T22:30:00Z', '+02:00').date === '2026-10-09');

const sleepMain = {
  id: 's1', cycle_id: 101, start: '2026-10-09T05:00:00Z', end: '2026-10-09T13:10:00Z', timezone_offset: '-06:00', nap: false, score_state: 'SCORED',
  score: {
    stage_summary: { total_in_bed_time_milli: 8 * 3600e3, total_awake_time_milli: 30 * 60e3 },
    sleep_needed: { baseline_milli: 7.5 * 3600e3, need_from_sleep_debt_milli: 40 * 60e3, need_from_recent_strain_milli: 15 * 60e3, need_from_recent_nap_milli: 0 },
    respiratory_rate: 15.4321, sleep_performance_percentage: 88, sleep_consistency_percentage: 71, sleep_efficiency_percentage: 93.6,
  },
};
const nap = { ...sleepMain, id: 'nap1', nap: true, end: '2026-10-09T21:00:00Z' };
const recovery = { cycle_id: 101, sleep_id: 's1', created_at: '2026-10-09T13:20:00Z', score_state: 'SCORED',
  score: { user_calibrating: false, recovery_score: 41, resting_heart_rate: 52, hrv_rmssd_milli: 61.7, spo2_percentage: 96.2, skin_temp_celsius: 33.71 } };
const pendingRecovery = { ...recovery, cycle_id: 102, sleep_id: 's2', score_state: 'PENDING_SCORE' };
const cycle = { id: 101, start: '2026-10-09T05:00:00Z', end: null, timezone_offset: '-06:00', score_state: 'SCORED', score: { strain: 12.345 } };
const soccer = { id: 'w1', start: '2026-10-09T01:00:00Z', end: '2026-10-09T02:15:00Z', timezone_offset: '-06:00', sport_name: 'soccer', score_state: 'SCORED', score: { strain: 13.2, average_heart_rate: 151, max_heart_rate: 186 } };
const ride = { ...soccer, id: 'w2', sport_name: 'cycling' };

const days = buildDailyWhoop({ recoveries: [recovery, pendingRecovery] as any, sleeps: [sleepMain, nap] as any, cycles: [cycle] as any, workouts: [soccer, ride] as any });
const d9 = days.find((d) => d.date === '2026-10-09');
const d8 = days.find((d) => d.date === '2026-10-08');
check('Recovery + sleep land on the local wake day', !!d9 && d9.hasWellness && d9.fields.readiness_score === 41);
check('HRV/RHR/SpO2/skin temp mapped', d9?.fields.hrv === 62 && d9?.fields.rhr === 52 && d9?.fields.spo2 === 96.2 && d9?.fields.skin_temp_c === 33.71);
check('Sleep = in bed − awake; need = baseline + debt + strain', d9?.fields.sleep_seconds === 7.5 * 3600 && d9?.fields.sleep_need_seconds === Math.round((7.5 * 3600e3 + 55 * 60e3) / 1000));
check('Sleep debt + performance + respiratory rate', d9?.fields.sleep_debt_seconds === 2400 && d9?.fields.wellness_sleep_score === 88 && d9?.fields.respiratory_rate === 15.43);
check('Day strain from the linked cycle', d9?.fields.day_strain === 12.35);
check('Naps never define the day', !days.some((d) => d.date === '2026-10-09' && d.fields.sleep_seconds !== 7.5 * 3600));
check('PENDING_SCORE recovery ignored', days.every((d) => d.fields.readiness_score !== undefined ? d.fields.readiness_score === 41 : true));
check('Non-ride activity kept on its local day (soccer, evening of the 8th)',
  !!d8 && d8.fields.other_activities?.length === 1 && d8.fields.other_activities[0].sport === 'soccer' && d8.fields.other_activities[0].minutes === 75);
check('Whoop-recorded rides ignored (Strava has them with power)', isCyclingSport('cycling') && isCyclingSport('Mountain Biking') && !isCyclingSport('soccer'));
check('Strain/activity-only day does not claim the wellness source', d8?.hasWellness === false);

// ---- Webhook signature ----
const secret = 'test-secret';
const body = JSON.stringify({ user_id: 10129, id: 'abc', type: 'recovery.updated', trace_id: 't1' });
const ts = '1728460000000';
const sig = crypto.createHmac('sha256', secret).update(ts + body).digest('base64');
check('Signature: valid accepted', verifyWhoopSignature(Buffer.from(body), ts, sig, secret));
check('Signature: tampered body rejected', !verifyWhoopSignature(Buffer.from(body.replace('10129', '99999')), ts, sig, secret));
check('Signature: missing headers rejected', !verifyWhoopSignature(Buffer.from(body), undefined, sig, secret) && !verifyWhoopSignature(Buffer.from(body), ts, undefined, secret));

// ---- Source priority ----
check('Priority: Apple Health cannot overwrite Whoop', !canWriteWellness('whoop', 'apple_health'));
check('Priority: intervals.icu cannot overwrite Whoop either', !canWriteWellness('whoop', 'intervals_icu'));
check('Non-Whoop athletes unchanged: intervals.icu and Apple Health still overwrite each other (their opt-in decides which is used)',
  canWriteWellness('apple_health', 'intervals_icu') && canWriteWellness('intervals_icu', 'apple_health'));
check('Priority: Whoop overwrites Apple Health; anything fills an empty day', canWriteWellness('apple_health', 'whoop') && canWriteWellness(null, 'intervals_icu'));

// ---- Coach summary ----
check('Bands: 67 green, 66 yellow, 34 yellow, 33 red', bandFor(67) === 'green' && bandFor(66) === 'yellow' && bandFor(34) === 'yellow' && bandFor(33) === 'red');
const hist = [
  { date: '2026-10-09', wellness_source: 'whoop', readiness_score: 28, hrv: 45, rhr: 58, sleep_seconds: 5.5 * 3600, sleep_need_seconds: 8 * 3600, sleep_debt_seconds: 3600 },
  { date: '2026-10-08', wellness_source: 'whoop', readiness_score: 30, hrv: 50, other_activities: [{ sport: 'soccer', minutes: 75, strain: 13.2 }] },
  { date: '2026-10-07', wellness_source: 'whoop', readiness_score: 70, hrv: 62 },
  { date: '2026-10-06', wellness_source: 'whoop', readiness_score: 75, hrv: 64 },
  { date: '2026-10-05', wellness_source: 'whoop', readiness_score: 80, hrv: 66 },
];
const sum = summarizeWhoop('2026-10-09', hist as any);
check('Summary: RED + 2 reds in a row', sum.band === 'red' && sum.consecutiveReds === 2 && /2 RED days in a row/.test(sum.line), sum.line);
check('Summary: HRV vs prior 7-day avg', /HRV 45ms \(-26% vs 7-day avg 61\)/.test(sum.line), sum.line);
check('Summary: sleep vs need + debt', /sleep 5h30 of 8h00 needed, sleep debt 1h00/.test(sum.line));
check("Summary: yesterday's soccer surfaced", /Yesterday off the bike: soccer 75min \(strain 13.2\)/.test(sum.line));
const none = summarizeWhoop('2026-10-10', hist as any);
check('Summary: no recovery today → says so, no invented number', !none.hasToday && /no recovery scored yet today/.test(none.line) && !/recovery \d+%/.test(none.line));

// ---- "Red that doesn't add up" (likely loose strap) → ask, don't assume ----
const base = [
  { date: '2026-10-08', wellness_source: 'whoop', readiness_score: 78, hrv: 62, rhr: 50 },
  { date: '2026-10-07', wellness_source: 'whoop', readiness_score: 74, hrv: 60, rhr: 51 },
  { date: '2026-10-06', wellness_source: 'whoop', readiness_score: 70, hrv: 61, rhr: 50 },
];
const looseStrap = [{ date: '2026-10-09', wellness_source: 'whoop', readiness_score: 22, hrv: 38, rhr: 51, sleep_seconds: 7.8 * 3600, sleep_need_seconds: 8 * 3600 }, ...base];
const ls = summarizeWhoop('2026-10-09', looseStrap as any);
check('Suspicious red flagged (green yesterday, slept enough, RHR normal)', ls.suspect && /CHECK with the athlete before recommending any change/.test(ls.line), ls.line);
const shortSleep = [{ ...looseStrap[0], sleep_seconds: 5 * 3600 }, ...base];
check('Real red not flagged: short sleep', !summarizeWhoop('2026-10-09', shortSleep as any).suspect);
const highRhr = [{ ...looseStrap[0], rhr: 58 }, ...base];
check('Real red not flagged: resting HR elevated', !summarizeWhoop('2026-10-09', highRhr as any).suspect);
const afterRed = [looseStrap[0], { ...base[0], readiness_score: 30 }, ...base.slice(1)];
check('Real red not flagged: red yesterday too', !summarizeWhoop('2026-10-09', afterRed as any).suspect);
const afterSoccer = [looseStrap[0], { ...base[0], other_activities: [{ sport: 'soccer', minutes: 90, strain: 15 }] }, ...base.slice(1)];
check('Real red not flagged: hard soccer yesterday', !summarizeWhoop('2026-10-09', afterSoccer as any).suspect);

// ---- Readiness uses Whoop recovery, skips subjective inputs ----
const light = { last7DaysTSS: 300, last7DaysRides: 4, yesterdayWorkout: null, lastRideDate: new Date().toISOString() };
const r = dailyReadinessService.calculateReadiness(light, { wellness_source: 'whoop', readiness_score: 25, feeling_score: 10, sleep_score: 10 });
check('Readiness: Whoop red drives it (great "feeling" ignored)', r.readinessScore < 5 && /Whoop recovery 25% \(red\)/.test(r.reasoning), `${r.readinessScore.toFixed(1)} — ${r.reasoning}`);
const g = dailyReadinessService.calculateReadiness(light, { wellness_source: 'whoop', readiness_score: 90 });
check('Readiness: Whoop green → high', g.readinessScore >= 8, g.readinessScore.toFixed(1));

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
