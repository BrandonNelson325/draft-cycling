/**
 * Proves the interval analysis engine turns raw Strava laps into a correct
 * work/recovery rep breakdown. Pure logic — no DB/network.
 *
 * Run: npm run test:intervals
 */
import { trimLaps, analyzeIntervals } from '../services/intervalAnalysisService';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

const FTP = 300;

// A realistic 5×5:00 threshold session with a slight fade, done on a head unit
// that laps each step: warm-up, [work, recovery] ×5, cool-down.
const rawLaps = [
  { lap_index: 1, moving_time: 600, distance: 5000, average_watts: 150, average_heartrate: 120, average_cadence: 88 }, // warm-up
  { lap_index: 2, moving_time: 300, distance: 3000, average_watts: 300, average_heartrate: 158, average_cadence: 92 }, // rep 1
  { lap_index: 3, moving_time: 180, distance: 1500, average_watts: 130, average_heartrate: 135, average_cadence: 85 }, // recovery
  { lap_index: 4, moving_time: 300, distance: 3000, average_watts: 296, average_heartrate: 160, average_cadence: 91 }, // rep 2
  { lap_index: 5, moving_time: 180, distance: 1500, average_watts: 128, average_heartrate: 138, average_cadence: 84 }, // recovery
  { lap_index: 6, moving_time: 300, distance: 2950, average_watts: 292, average_heartrate: 162, average_cadence: 90 }, // rep 3
  { lap_index: 7, moving_time: 180, distance: 1500, average_watts: 129, average_heartrate: 140, average_cadence: 85 }, // recovery
  { lap_index: 8, moving_time: 300, distance: 2900, average_watts: 285, average_heartrate: 164, average_cadence: 89 }, // rep 4
  { lap_index: 9, moving_time: 180, distance: 1500, average_watts: 127, average_heartrate: 142, average_cadence: 84 }, // recovery
  { lap_index: 10, moving_time: 300, distance: 2850, average_watts: 279, average_heartrate: 166, average_cadence: 88 }, // rep 5 (fade)
  { lap_index: 11, moving_time: 600, distance: 4500, average_watts: 140, average_heartrate: 130, average_cadence: 86 }, // cool-down
];

const laps = trimLaps(rawLaps);
check('trimLaps returns all 11 laps', laps.length === 11);
check('trimLaps keeps power + hr', laps[1].avg_watts === 300 && laps[1].avg_hr === 158);

const a = analyzeIntervals(laps, FTP);
check('detects intervals', a.hasIntervals === true, a.reason);
check('finds exactly 5 work reps', a.rep_count === 5, `got ${a.rep_count}`);
check('structure label is 5 × 5:00', a.structure_label === '5 × 5:00', a.structure_label);
check('warm-up/recovery/cool-down excluded from reps',
  !!a.reps && a.reps.every(r => (r.avg_watts ?? 0) >= 279));
check('avg %FTP ~ threshold', !!a.summary && a.summary.avg_pct_ftp! >= 95 && a.summary.avg_pct_ftp! <= 100,
  `${a.summary?.avg_pct_ftp}%`);
check('detects positive fade (faded, not negative split)', !!a.summary && a.summary.fade_pct! > 0,
  `fade ${a.summary?.fade_pct}%`);
check('strongest rep is rep 1', a.summary?.strongest_rep === 1);
check('weakest rep is rep 5', a.summary?.weakest_rep === 5);
check('reports HR drift upward across reps', !!a.summary && a.summary.hr_drift_bpm! > 0,
  `drift ${a.summary?.hr_drift_bpm}bpm`);
check('reports recovery power', !!a.summary && a.summary.avg_recovery_power! < 140,
  `${a.summary?.avg_recovery_power}W`);

// A steady endurance ride with only 2 laps → NOT an interval workout.
const steady = trimLaps([
  { lap_index: 1, moving_time: 3600, distance: 30000, average_watts: 180, average_heartrate: 140 },
  { lap_index: 2, moving_time: 3600, distance: 29000, average_watts: 178, average_heartrate: 142 },
]);
const b = analyzeIntervals(steady, FTP);
check('steady ride reports no intervals', b.hasIntervals === false, b.reason);

// No-power ride → graceful no-intervals.
const noPower = trimLaps([
  { lap_index: 1, moving_time: 300 }, { lap_index: 2, moving_time: 300 }, { lap_index: 3, moving_time: 300 },
]);
const c = analyzeIntervals(noPower, FTP);
check('no-power ride reports no intervals', c.hasIntervals === false, c.reason);

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
