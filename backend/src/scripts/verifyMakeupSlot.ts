/**
 * Swapping today's hard session for something easier should MOVE it to the
 * next good easy day, not drop it (Oct 29 2026: sprints → "could do it tomorrow").
 * Run: npm run test:makeup-slot
 */
import { findMakeupSlot, makeupSentence, type PlannedDay } from '../utils/makeupSlot';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const sprints = { name: 'Draft - Sprint Efforts · 8 × 15 sec @ 200%', workout_type: 'sprint' };
const day = (date: string, name: string, workout_type: string, extra: Partial<PlannedDay> = {}): PlannedDay => ({
  date, ...extra,
  entry: { id: `e-${date}`, entry_type: 'workout', completed: false, workout: { id: `w-${date}`, name, workout_type, duration_minutes: 90, tss: 60 } },
});
const rest = (date: string): PlannedDay => ({ date, entry: { id: `e-${date}`, entry_type: 'rest', completed: false, workout: null } });

// The real week: Thu sprints, Fri endurance 90, Sat sweet spot, Sun rest.
const week = [day('2026-10-30', 'Draft - Endurance Ride', 'endurance'), day('2026-10-31', 'Draft - Sweet Spot Intervals', 'sweet_spot'), rest('2026-11-01')];
const s1 = findMakeupSlot(sprints, '2026-10-29', week);
check('Sprints move to tomorrow\'s endurance ride', s1?.date === '2026-10-30' && s1.workout.id === 'w-2026-10-30', JSON.stringify(s1));

check('Easy session → no makeup needed', findMakeupSlot({ name: 'Endurance', workout_type: 'endurance' }, '2026-10-29', week) === null);

check('Planned rest day is never used', findMakeupSlot(sprints, '2026-10-29', [rest('2026-10-30'), rest('2026-10-31'), rest('2026-11-01')]) === null);

check('Never lands next to another hard day', findMakeupSlot(sprints, '2026-10-29', [
  day('2026-10-30', 'Threshold', 'threshold'), day('2026-10-31', 'Endurance', 'endurance'), day('2026-11-01', 'VO2', 'vo2max'),
]) === null);

const s2 = findMakeupSlot(sprints, '2026-10-29', [
  day('2026-10-30', 'Threshold', 'threshold'), day('2026-10-31', 'Endurance', 'endurance'), day('2026-11-01', 'Recovery Spin', 'recovery'), day('2026-11-02', 'Endurance', 'endurance'),
]);
check('Skips a day that would sit after a hard day; takes the next safe one', s2?.date === '2026-11-01', JSON.stringify(s2?.date));

check('Not next to a race', findMakeupSlot(sprints, '2026-10-29', [day('2026-10-30', 'Endurance', 'endurance'), day('2026-10-31', 'ZRL race', 'custom')]) === null);

check('Multi-session day is never swapped into', findMakeupSlot(sprints, '2026-10-29', [day('2026-10-30', 'Endurance', 'endurance', { locked: true })]) === null);

check('Beyond the 3-day window → none', findMakeupSlot(sprints, '2026-10-29', [day('2026-11-02', 'Endurance', 'endurance')]) === null);

const text = makeupSentence(sprints.name, 'easier', s1!, '2026-10-29');
check('Card says exactly what Accept does', /moves Sprint Efforts to tomorrow/.test(text) && /Endurance Ride \(90 min\) today/.test(text), text);

console.log(failures ? `\n${failures} FAILED` : '\n✅ ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
