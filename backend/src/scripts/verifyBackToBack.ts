/**
 * Coach calendar edits must not silently stack hard days.
 * Oct 27 2026: sprints moved onto the day after a maximal ZRL race, coach said
 * "legs are still fresh from today's race". Run: npm run test:back-to-back
 */
import { backToBackConflict, isHardWorkout, hardDayReason } from '../utils/backToBack';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const empty = { rides: [], planned: [] };
const sprints = { name: 'Draft - Sprint Efforts · 8 × 15 sec @ 200%', workout_type: 'sprint' };
const endurance = { name: 'Draft - Endurance Ride', workout_type: 'endurance' };
const zrlToday = {
  rides: [
    { name: 'Zwift - INEOS Grenadiers Virtual Training Camp | The Pre-Race Warm-up', rpe: 5, intensityFactor: 0.72, tss: 14.9 },
    { name: 'Zwift Racing League 26/27: Fast & Fresh : Open Ruby League Division 1 - Race 5 (B)', rpe: 5, intensityFactor: 0.91, tss: 60.3 },
    { name: 'Zwift - Pacer Group Ride with Coco', rpe: 2, intensityFactor: 0.59, tss: 26.1 },
  ],
  planned: [],
};

// The real case: sprints onto Wednesday, ZRL race Tuesday.
const real = backToBackConflict(sprints, zrlToday, empty);
check('Sprints the day after a race → needs confirmation', !!real, real || '');
check('Message names the race', !!real && /raced/.test(real));
check('Names the race, not the pre-race warm-up', !!real && /raced \("Zwift Racing League/.test(real));
check('Counts the WHOLE day (3 rides, 101 TSS)', !!real && /3 rides, 101 TSS total/.test(real));
const threeModerate = { rides: [1, 2, 3].map((i) => ({ name: `Ride ${i}`, rpe: 3, intensityFactor: 0.7, tss: 40 })), planned: [] };
check('Several moderate rides adding up to a big day count as hard', /big day/.test(hardDayReason(threeModerate) || ''), hardDayReason(threeModerate) || '');
check('Endurance the day after a race → fine', backToBackConflict(endurance, zrlToday, empty) === null);
check('Sprints with easy days around → fine', backToBackConflict(sprints, { rides: [{ name: 'Easy spin', rpe: 2 }], planned: [] }, empty) === null);
check('Hard ride by RPE (4/5) counts', hardDayReason({ rides: [{ name: 'Group ride', rpe: 4 }], planned: [] }) !== null);
check('Hard ride by IF (0.9) counts', hardDayReason({ rides: [{ name: 'Group ride', intensityFactor: 0.9 }], planned: [] }) !== null);
check('Hard session scheduled the day AFTER → flagged',
  backToBackConflict(sprints, empty, { rides: [], planned: [{ name: 'Draft - ZRL race (fixed)', workout_type: 'custom' }] }) !== null);
check('Race named workout is hard', isHardWorkout({ name: 'Draft - ZRL race (fixed)', workout_type: 'custom' }));
check('Sweet spot / tempo are not "hard" for this guard', !isHardWorkout({ name: 'SS', workout_type: 'sweet_spot' }) && !isHardWorkout({ name: 'T', workout_type: 'tempo' }));

console.log(failures ? `\n${failures} FAILED` : '\nAll back-to-back checks passed');
process.exit(failures ? 1 : 0);
