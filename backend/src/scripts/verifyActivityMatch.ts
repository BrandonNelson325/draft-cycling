/**
 * Auto-match guard for hard sessions. Run: npm run test:activity-match
 */
import { activityMatchingService, rideIsPlannedWorkout } from '../services/activityMatchingService';
import { isHardWorkout } from '../utils/backToBack';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) { failed++; if (detail !== undefined) console.log('   ', detail); }
}

const sprint = 'Draft - Sprint Efforts · 8 × 15 sec @ 200%';
// Nov 3 2026: this pair scored "high" on TSS + duration alone.
const score = activityMatchingService.scoreMatch({ tss: 68, moving_time_seconds: 4780 }, { tss: 67, duration_minutes: 60 });
check('group ride vs sprints scores high on TSS/duration (why the guard is needed)', score.confidence === 'high', score);
check('sprint session is hard', isHardWorkout({ name: sprint, workout_type: 'sprint' }));
check('group ride is NOT the sprint session', !rideIsPlannedWorkout('Zwift - Group Ride: One Ride to Rule Them All', sprint));
check('Zwift upload of the workout IS the session', rideIsPlannedWorkout('Zwift - Draft - Sprint Efforts', sprint));
check('head-unit upload with the plain name IS the session', rideIsPlannedWorkout('Sprint Efforts', sprint));
check('no ride name → not matched', !rideIsPlannedWorkout(null, sprint));
check('endurance stays auto-matchable (not hard)', !isHardWorkout({ name: 'Draft - Endurance Ride', workout_type: 'endurance' }));

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
