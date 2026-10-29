/**
 * Today's suggested swap must not vanish or flip when the suggestion is
 * regenerated (Oct 29 2026: "Swap sprints for Z2" at 6:49, gone at 6:50).
 * Run: npm run test:sticky-adjustment
 */
import { stickyAdjustmentFor, stickyAdjustmentNote } from '../utils/stickyAdjustment';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const stored = {
  kind: 'easier', headline: 'Swap sprints for Z2 endurance.',
  reason: 'HRV suppressed (-10%), sleep short (6.7 h), WHOOP yellow (54%).',
  replacement: { type: 'endurance', duration_minutes: 90 },
  workout_id: 'w-sprints', date: '2026-10-29', generatedAt: '2026-10-29T13:49:00Z',
};

check('Reused for the same workout today', stickyAdjustmentFor({ workout_id: 'w-sprints', suggested_adjustment: stored }, '2026-10-29')?.headline === stored.headline);
check('Stale after the workout changed (moved/edited/accepted)', stickyAdjustmentFor({ workout_id: 'w-other', suggested_adjustment: stored }, '2026-10-29') === null);
check('Stale on another day', stickyAdjustmentFor({ workout_id: 'w-sprints', suggested_adjustment: stored }, '2026-10-30') === null);
check('Nothing stored → null', stickyAdjustmentFor({ workout_id: 'w-sprints', suggested_adjustment: null }, '2026-10-29') === null);
check('"none" never sticks', stickyAdjustmentFor({ workout_id: 'w-sprints', suggested_adjustment: { ...stored, kind: 'none' } }, '2026-10-29') === null);
check('Note tells the AI to stay consistent', /Stay consistent/.test(stickyAdjustmentNote(stored as any)) && /Swap sprints/.test(stickyAdjustmentNote(stored as any)));
check('After "Continue with plan" the AI backs the athlete', /Continue with plan/.test(stickyAdjustmentNote(stored as any, true)) && !/must repeat it/.test(stickyAdjustmentNote(stored as any, true)));

console.log(failures ? `\n${failures} FAILED` : '\n✅ ALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
