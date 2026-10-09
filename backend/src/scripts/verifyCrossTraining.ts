/**
 * Cross-training: every Strava activity counts, rated for its effect on
 * CYCLING. Pure/offline.
 *
 * Run: npm run test:cross-training
 */
import { categorize, estimateActivityLoad, isRideType, buildDailyLoad } from '../utils/activityLoad';
import { describeCrossTraining } from '../utils/crossTrainingCoaching';
import { summarizeWhoop } from '../utils/whoopCoaching';
import { formatLiveState } from '../utils/liveState';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

// ---- Classification ----
check('Mountain bike rides are rides (old "MountainBikRide" typo dropped them)', isRideType('MountainBikeRide') && isRideType('EMountainBikeRide') && isRideType('GravelRide'));
check('Runs / kayaks / gym / soccer classified', categorize('Run') === 'run' && categorize('TrailRun') === 'trail_run'
  && categorize('Kayaking') === 'paddle' && categorize('WeightTraining') === 'strength' && categorize('Soccer') === 'team_sport');
check('Unknown sport → other', categorize('Wheelchair') === 'other');

// ---- The user's example: a 10-mile run hits cycling far harder than a kayak ----
const phys = { maxHr: 190, restingHr: 50 };
const run = estimateActivityLoad({ sportType: 'Run', movingTimeSeconds: 80 * 60, averageHeartrate: 155, ...phys });
const kayak = estimateActivityLoad({ sportType: 'Kayaking', movingTimeSeconds: 80 * 60, averageHeartrate: 120, ...phys });
check('10-mile run (80 min @ 155 bpm): HR-based load', run.method === 'hr' && run.estTss > 90 && run.estTss < 120, `est ${run.estTss}, IF ${run.intensityFactor}`);
check('Run fatigue (legs) > its systemic load; fitness credit partial', run.fatigueLoad > run.estTss && run.fitnessLoad < run.estTss, `fatigue ${run.fatigueLoad}, fitness ${run.fitnessLoad}`);
check('Kayak (80 min @ 120 bpm) is light on cycling legs', kayak.fatigueLoad < 25, `fatigue ${kayak.fatigueLoad}`);
check('Run fatigue ≥ 5× kayak fatigue', run.fatigueLoad >= 5 * kayak.fatigueLoad, `${run.fatigueLoad} vs ${kayak.fatigueLoad}`);

// ---- No heart rate → duration × sport intensity ----
const noHr = estimateActivityLoad({ sportType: 'Run', movingTimeSeconds: 60 * 60 });
check('No HR → duration estimate (60 min run ≈ 64)', noHr.method === 'duration' && Math.round(noHr.estTss) === 64, `${noHr.estTss}`);
const lift = estimateActivityLoad({ sportType: 'WeightTraining', movingTimeSeconds: 60 * 60, averageHeartrate: 95, ...phys });
check('Strength: low HR floored (HR undersells muscular load)', lift.intensityFactor === 0.6 && lift.fitnessLoad === 0, `IF ${lift.intensityFactor}`);
const yoga = estimateActivityLoad({ sportType: 'Yoga', movingTimeSeconds: 60 * 60 });
check('Yoga barely registers', yoga.fatigueLoad < 3, `${yoga.fatigueLoad}`);
const noPowerRide = estimateActivityLoad({ sportType: 'Ride', movingTimeSeconds: 90 * 60, averageHeartrate: 140, ...phys });
check('Ride without power still gets a load (1:1 fitness/fatigue)', noPowerRide.estTss > 50 && noPowerRide.fitnessLoad === noPowerRide.fatigueLoad, `${noPowerRide.estTss}`);
const ageOnly = estimateActivityLoad({ sportType: 'Run', movingTimeSeconds: 3600, averageHeartrate: 150, age: 40 });
check('Max HR estimated from age when unknown', ageOnly.method === 'hr');

// ---- Daily load feeds CTL (fitness) and ATL (fatigue) differently ----
const daily = buildDailyLoad(
  [{ start_date: '2026-10-07T14:00:00Z', tss: 80 }, { start_date: '2026-10-08T14:00:00Z', tss: null }],
  [{ start_date: '2026-10-07T23:00:00Z', fitness_load: 60, fatigue_load: 125 }],
);
const d7 = daily.get('2026-10-07');
check('Ride + run same day: fitness 80+60, fatigue 80+125', d7?.fitness === 140 && d7?.fatigue === 205, JSON.stringify(d7));
check('Rides with no TSS add nothing', !daily.has('2026-10-08'));

// ---- Coach-facing text ----
const line = describeCrossTraining({
  sport_type: 'Run', category: 'run', start_date: '2026-10-07T23:00:00Z', moving_time_seconds: 4800,
  distance_meters: 16093, average_heartrate: 155, fatigue_load: 125, load_method: 'hr', name: 'Evening run',
}, () => '2026-10-07', 'imperial');
check('Coach line: distance, HR, load, leg note', /Run "Evening run": 80min, 10\.0mi, avg HR 155; fatigue load ~125 — leg-heavy/.test(line), line);
const live = formatLiveState({
  nowLabel: 'x', todayIso: '2026-10-08', activePlans: [], upcoming: [], ridesToday: [], changes: [],
  otherTraining: ['yesterday Run: 80min; fatigue load ~125 — leg-heavy'],
});
check('Live state shows other training', /Other training \(non-cycling\): yesterday Run/.test(live));

// ---- Whoop + Strava saw the same soccer game → shown once ----
const hist = [
  { date: '2026-10-08', wellness_source: 'whoop', readiness_score: 60, hrv: 55 },
  { date: '2026-10-07', wellness_source: 'whoop', readiness_score: 70, other_activities: [{ sport: 'soccer', minutes: 75, strain: 13, start: '2026-10-08T01:00:00Z' }] },
];
check('Whoop copy of a Strava-recorded activity is dropped', !/soccer/.test(summarizeWhoop('2026-10-08', hist as any, ['2026-10-08T01:10:00Z']).line));
check('Whoop-only activity still shown', /soccer/.test(summarizeWhoop('2026-10-08', hist as any, []).line));

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
