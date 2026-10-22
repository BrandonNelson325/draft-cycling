/**
 * The daily suggestion's readiness block must compare HRV / resting HR to the
 * athlete's OWN baseline and lead with WHOOP recovery. Oct 22 2026: bare numbers
 * let the model call an above-baseline HRV "suppressed" and swap intervals on a
 * green (74%) WHOOP day.
 *
 * Run: npm run test:readiness
 */
import { buildReadinessBlock } from '../services/dailyAnalysisService';

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

console.log(failures ? `\n${failures} FAILED` : '\nAll readiness tests passed');
process.exit(failures ? 1 : 0);
