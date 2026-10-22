/**
 * Coach check-ins: the coach spots a training pattern (too easy, too hard,
 * missed, cut short, easy days ridden hard, gone quiet, great block) and
 * reaches out first — at most one at a time, never nagging on old evidence.
 *
 * Run: npm run test:checkins
 */
import { detectCheckIns, pickCheckIn, buildCheckInPrompt, summarizeForPlanning, Session, CheckInFacts } from '../services/coachCheckInService';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

const TODAY = '2026-10-21'; // a Wednesday
const ago = (n: number) => new Date(Date.parse(TODAY + 'T12:00:00Z') - n * 86_400_000).toISOString().slice(0, 10);

function s(daysAgo: number, type: string, o: Partial<Session> = {}): Session {
  return {
    date: ago(daysAgo), name: `${type} session`, type, plannedMin: 60, special: false,
    done: true, rideMin: 60, rideIF: type === 'endurance' ? 0.68 : 0.85, rpe: 3, notes: null, ...o,
  };
}
function facts(sessions: Session[], o: Partial<CheckInFacts> = {}): CheckInFacts {
  return { today: TODAY, sessions: sessions.sort((a, b) => b.date.localeCompare(a.date)), daysSinceLastRide: 1, daysSinceFtpTest: 20, experienceLevel: 'intermediate', ftp: 250, ...o };
}
const kinds = (f: CheckInFacts) => detectCheckIns(f).map((c) => c.kind);

// ---- A plan landing well: nothing to raise (but not yet a "great block") ----
const normal = facts([s(1, 'threshold'), s(2, 'endurance', { rpe: 2 }), s(4, 'vo2max', { rpe: 4 }), s(5, 'endurance', { rpe: 2 }), s(6, 'sweet_spot')]);
check('Normal week → no check-in', kinds(normal).length === 0, kinds(normal).join(','));

// ---- Too easy ----
const easyQ = [s(1, 'threshold', { rpe: 2 }), s(3, 'vo2max', { rpe: 1 }), s(5, 'sweet_spot', { rpe: 2 }), s(8, 'threshold', { rpe: 2 })];
const tooEasy = detectCheckIns(facts([...easyQ, s(2, 'endurance', { rpe: 2 })], { daysSinceFtpTest: 60 }));
check('Quality sessions rated 1–2 → too_easy', tooEasy[0]?.kind === 'too_easy');
check('Stale FTP → suggests an FTP test first', tooEasy[0]?.suggestion === 'ftp_test');
check('Recent FTP, intermediate → suggests moving up a level',
  detectCheckIns(facts([...easyQ], { daysSinceFtpTest: 10 }))[0]?.suggestion === 'level_up');
check('Recent FTP, already advanced → harder block',
  detectCheckIns(facts([...easyQ], { daysSinceFtpTest: 10, experienceLevel: 'advanced' }))[0]?.suggestion === 'harder_block');
check('Endurance rides feeling easy is NORMAL → no too_easy',
  !kinds(facts([1, 2, 3, 4, 5].map((d) => s(d, 'endurance', { rpe: 1 })))).includes('too_easy'));
check('Easy rating on a ride cut short does not count as too easy',
  !kinds(facts(easyQ.map((x) => ({ ...x, rideMin: 30 })))).includes('too_easy'));

// ---- Too hard ----
const hard = facts([s(1, 'threshold', { rpe: 5 }), s(3, 'endurance', { rpe: 4 }), s(5, 'vo2max', { rpe: 3, notes: "couldn't finish the last two reps" }), s(7, 'sweet_spot')]);
check('Max RPE + hard endurance + "couldn\'t finish" → too_hard', kinds(hard)[0] === 'too_hard');
check('FTP tests at RPE 5 are expected, not a struggle',
  !kinds(facts([1, 3, 5].map((d) => s(d, 'custom', { rpe: 5, special: true })))).includes('too_hard'));

// ---- Missed ----
const missed = facts([
  s(1, 'threshold', { done: false }), s(3, 'endurance'), s(5, 'vo2max'), s(8, 'threshold', { done: false }),
  s(10, 'endurance'), s(12, 'sweet_spot'), s(13, 'threshold', { done: false }),
]);
const m = detectCheckIns(missed).find((c) => c.kind === 'missed_workouts');
check('3 of 7 missed in 2 weeks → missed_workouts', !!m);
check('Missed check-in names the weekday pattern', !!m && /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/.test(m.summary[0]));
check('2 misses is not a pattern', !kinds(facts([s(1, 'threshold', { done: false }), s(3, 'endurance', { done: false }), s(5, 'vo2max'), s(6, 'endurance'), s(8, 'threshold')])).includes('missed_workouts'));

// ---- Gone quiet beats missed ----
const quiet = facts([s(1, 'threshold', { done: false }), s(3, 'endurance', { done: false }), s(5, 'vo2max', { done: false }), s(9, 'endurance')], { daysSinceLastRide: 8 });
check('No rides in 8 days → gone_quiet first, not also missed', kinds(quiet)[0] === 'gone_quiet' && !kinds(quiet).includes('missed_workouts'));

// ---- Cut short ----
const short = facts([s(1, 'endurance', { plannedMin: 90, rideMin: 50 }), s(3, 'threshold', { plannedMin: 75, rideMin: 45 }), s(8, 'endurance', { plannedMin: 90, rideMin: 55 }), s(9, 'vo2max')]);
check('Rides ending under 75% of plan → cut_short', kinds(short).includes('cut_short'));
check('Short planned sessions (<45 min) never count', !kinds(facts([1, 3, 5].map((d) => s(d, 'recovery', { plannedMin: 30, rideMin: 15 })))).includes('cut_short'));

// ---- Easy days ridden hard ----
const hot = facts([s(1, 'endurance', { rideIF: 0.88 }), s(3, 'recovery', { rideIF: 0.74 }), s(5, 'endurance', { rideIF: 0.85 }), s(6, 'threshold')]);
check('Endurance/recovery ridden at tempo+ → easy_days_too_hard', kinds(hot).includes('easy_days_too_hard'));

// ---- Great block ----
const great = facts(Array.from({ length: 10 }, (_, i) => s(i * 2 + 1, i % 2 ? 'endurance' : 'threshold')));
check('10/10 sessions done in 3 weeks → great_block', kinds(great).join() === 'great_block');

// ---- pickCheckIn: never nag ----
const found = detectCheckIns(facts([...easyQ], { daysSinceFtpTest: 60 }));
check('First time → sends', pickCheckIn(found, [], TODAY)?.kind === 'too_easy');
check('Any check-in 2 days ago → wait', pickCheckIn(found, [{ kind: 'missed_workouts', created_at: ago(2) + 'T18:05:00Z' }], TODAY) === null);
check('Same kind within its cooldown → skip', pickCheckIn(found, [{ kind: 'too_easy', created_at: ago(10) + 'T18:05:00Z' }], TODAY) === null);
check('Cooldown over + new evidence → sends again', pickCheckIn(found, [{ kind: 'too_easy', created_at: ago(15) + 'T18:05:00Z' }], TODAY)?.kind === 'too_easy');
const oldEvidence = detectCheckIns(facts(easyQ.map((x, i) => ({ ...x, date: ago(17 + i) })), { daysSinceFtpTest: 60 }));
check('Evidence all older than the last same-kind check-in → skip', pickCheckIn(oldEvidence, [{ kind: 'too_easy', created_at: ago(16) + 'T18:05:00Z' }], TODAY) === null);
const two = detectCheckIns(hard).concat(found);
check('Blocked kind falls through to the next one', pickCheckIn(two, [{ kind: 'too_hard', created_at: ago(4) + 'T18:05:00Z' }], TODAY)?.kind === 'too_easy');

// ---- Prompt ----
const p = buildCheckInPrompt(tooEasy[0]);
check('Prompt marks it coach-initiated', p.startsWith('[COACH-INITIATED CHECK-IN]'));
check('Prompt carries the evidence and the suggestion', p.includes('RPE 1/5') && /FTP test/.test(p));
check('Prompt says offer, not apply', /OFFER the change, never claim/.test(p));
check('Missed prompt asks WHY before fixing', /Ask WHY/.test(buildCheckInPrompt(m!)));

// ---- Plan designer summary ----
const sum = summarizeForPlanning(missed) || '';
check('Designer summary reports completion and missed days', /Completed 4 of 7/.test(sum) && /Missed days/.test(sum));
check('Too little data → no designer summary', summarizeForPlanning(facts([s(1, 'threshold')])) === null);

console.log(failures ? `\n${failures} FAILED` : '\nAll check-in tests passed');
process.exit(failures ? 1 : 0);
