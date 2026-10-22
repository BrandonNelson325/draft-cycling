/**
 * The daily suggestion's readiness block must compare HRV / resting HR to the
 * athlete's OWN baseline and lead with WHOOP recovery. Oct 22 2026: bare numbers
 * let the model call an above-baseline HRV "suppressed" and swap intervals on a
 * green (74%) WHOOP day.
 *
 * Run: npm run test:readiness
 */
import { buildReadinessBlock, resolveEasierReplacement } from '../services/dailyAnalysisService';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

const history = [
  { hrv: 61, rhr: 55, sleep_seconds: 26448 }, { hrv: 54, rhr: 57, sleep_seconds: 20268 }, { hrv: 47, rhr: 60, sleep_seconds: 23270 },
  { hrv: 52, rhr: 56, sleep_seconds: 24088 }, { hrv: 62, rhr: 53, sleep_seconds: 26661 }, { hrv: 49, rhr: 59, sleep_seconds: 22460 },
  { hrv: 50, rhr: 58, sleep_seconds: 28086 },
];
const oct22 = { wellness_source: 'whoop', readiness_score: 74, hrv: 57, rhr: 60, sleep_seconds: 21311 };
const b = buildReadinessBlock(oct22, history);
check('Real Oct 22 case: HRV is ABOVE baseline, not suppressed', /HRV: 57 ms vs \d+ ms baseline \(\+\d+%\) → ABOVE baseline/.test(b) && !/HRV[^\n]*SUPPRESSED/.test(b), b);
check('Real Oct 22 case: resting HR not called elevated', /Resting HR: 60 bpm[^\n]*→ (normal|slightly up)/.test(b) && !/ELEVATED/.test(b));
check('WHOOP green leads, as the primary signal', /WHOOP recovery: 74% \(GREEN/.test(b) && /primary readiness signal/.test(b));
check('Short sleep is still flagged', /5\.9h[^\n]*SHORT/.test(b));
check('Green-day rule: one short night is not a reason to swap', /one short night alone is a note/.test(b));

const low = buildReadinessBlock({ hrv: 40, rhr: 64 }, history);
check('HRV 20%+ below baseline → SUPPRESSED', /→ SUPPRESSED/.test(low));
check('Resting HR +7 → ELEVATED', /→ ELEVATED/.test(low));
check('Red WHOOP → go easy', /RED — not recovered/.test(buildReadinessBlock({ wellness_source: 'whoop', readiness_score: 25 }, history)));
check('No baseline → told not to judge', /no baseline yet — do NOT call it high or low/.test(buildReadinessBlock({ hrv: 57 }, [])));
check('No data → fallback line', /No morning check-in/.test(buildReadinessBlock(null)));

// ---- "Accept suggestion" for an easier day puts a real, bounded workout on the calendar ----
const r1 = resolveEasierReplacement({ type: 'endurance', duration_minutes: 60 }, 90);
check('Model replacement used as given', r1.type === 'endurance' && r1.duration === 60 && r1.tss > 0);
check('Never longer than the planned workout', resolveEasierReplacement({ type: 'endurance', duration_minutes: 150 }, 90).duration === 90);
check('Hard types rejected → endurance', resolveEasierReplacement({ type: 'vo2max', duration_minutes: 60 }, 90).type === 'endurance');
const r2 = resolveEasierReplacement(undefined, 90, 'Swap for Z2 endurance ride (~60 min, 40 TSS).');
check('No replacement → read from the headline (Oct 22 card)', r2.type === 'endurance' && r2.duration === 60);
check('Recovery headline → recovery ride', resolveEasierReplacement(null, 75, 'Spin an easy Z1 recovery ride, 40 min').type === 'recovery');
check('Nothing usable → 60 min endurance, capped by plan', resolveEasierReplacement(null, 45).duration === 45);

console.log(failures ? `\n${failures} FAILED` : '\nAll readiness tests passed');
process.exit(failures ? 1 : 0);
