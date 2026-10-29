/**
 * Ride debrief planned-vs-actual. Run: npm run test:ride-debrief
 */
import { comparePlannedVsActual, formatRideDebrief, mainSetPct, parseDebriefRequest } from '../utils/rideDebrief';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) { failed++; if (detail !== undefined) console.log('   ', detail); }
}

const FTP = 299;
const z2 = { name: 'Draft - Endurance Ride', workout_type: 'endurance', duration_minutes: 70, tss: 53, targetPct: 70 };
// Oct 29 2026: the Zwift group ride that replaced the planned Z2.
const groupRide = {
  name: 'Zwift - Group Ride: Long - Stage 4 - Tour of Watopia 2026', duration_min: 70, avg_watts: 218, np: 234, tss: 71.1, rpe: 3,
  bests: { s5: 685, s30: 470, m1: 385, m5: 290, m20: 240 },
};

check('parses the ride popup message',
  parseDebriefRequest(`Give me a debrief on my ride "${groupRide.name}" — how hard was it (intensity vs threshold)…`) === groupRide.name);
check('parses the interval popup message', parseDebriefRequest('Give me a full debrief on my interval workout "SS 3x12" — how did my reps go') === 'SS 3x12');
check('ignores normal chat', parseDebriefRequest('how was my ride?') === null);

const c = comparePlannedVsActual(z2, groupRide, FTP);
check('group ride on a Z2 day = MORE', c.dose === 'more', c);
check('names the TSS overshoot', c.reasons.some((r) => r.includes('TSS 71 vs 53')), c.reasons);
check('names the 5-min threshold effort', c.reasons.some((r) => r.includes('5-min 290 W (97% FTP)')), c.reasons);
check('names the 1-min surge', c.reasons.some((r) => r.includes('1-min 385 W')), c.reasons);

const steady = { name: 'Z2', duration_min: 72, avg_watts: 205, np: 210, tss: 55, rpe: 2, bests: { s5: 420, s30: 300, m1: 260, m5: 230, m20: 220 } };
check('steady Z2 = about right', comparePlannedVsActual(z2, steady, FTP).dose === 'about right', comparePlannedVsActual(z2, steady, FTP));

const short = { ...steady, duration_min: 40, tss: 30 };
check('cut-short Z2 = LESS', comparePlannedVsActual(z2, short, FTP).dose === 'less');

const threshold = { name: 'Threshold 3x10', workout_type: 'threshold', duration_minutes: 75, tss: 85, targetPct: 98 };
const easySpin = { name: 'spin', duration_min: 75, np: 190, tss: 50, bests: { m5: 220, m20: 200 } };
check('threshold day ridden easy = LESS', comparePlannedVsActual(threshold, easySpin, FTP).dose === 'less', comparePlannedVsActual(threshold, easySpin, FTP));
check('hard efforts on a threshold day are not flagged', comparePlannedVsActual(threshold, { ...groupRide, tss: 80, duration_min: 75 }, FTP).dose === 'about right');

check('main set = longest work block', mainSetPct([{ type: 'warmup', power: 60, duration: 600 }, { type: 'work', power: 70, duration: 3300 }, { type: 'work', power: 120, duration: 60 }]) === 70);

const block = formatRideDebrief(groupRide, FTP, z2, [{ date: '2026-10-30', label: 'Sprint Efforts · 8 × 15 sec @ 200%' }]);
check('block shows plan, dose and next session',
  block.includes('Planned for that day: "Endurance Ride"') && block.includes('Dose vs plan: MORE') && block.includes('2026-10-30 Sprint Efforts'), block);
check('no plan → says so', formatRideDebrief(groupRide, FTP, null, []).includes('Planned for that day: nothing'));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
