/**
 * Coach AWARENESS eval — does the coach describe the athlete's ACTUAL current
 * state (plans, calendar, today's riding, fatigue/freshness), or does it answer
 * from stale chat memory?
 *
 * Each scenario builds a realistic athlete context and runs it through the REAL
 * production prompt (buildSystemPromptWithTools), the LIVE STATE snapshot, the
 * real tool list (tools answered from the scenario's own fake data — nothing
 * touches the DB) and the state-claim guard, against live Sonnet. The final
 * reply — what the athlete would see — is graded by hard must-not patterns plus
 * an LLM judge against what a coach who truly knew the state would say.
 *
 * Costs ~2–4 Sonnet calls per scenario. Needs ANTHROPIC_API_KEY (backend/.env).
 * Run: npm run eval:awareness   (add `-- --only=deleted` to filter, `-- -v` for replies)
 */
import { aiCoachService } from '../services/aiCoachService';
import { formatLiveState } from '../utils/liveState';
import { findStateContradictions, describeFacts, StateFacts } from '../utils/stateGuard';
import { anthropic, SONNET } from '../utils/anthropic';
import { AI_TOOLS } from '../services/aiTools';

const VERBOSE = process.argv.includes('-v');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).toLowerCase();
const TODAY = '2026-10-08'; // Thursday
const TZ = 'America/Denver';

type Entry = { scheduled_date: string; entry_type?: string; completed?: boolean; workouts?: any };
const wk = (date: string, name: string, type: string, mins: number): Entry => ({
  scheduled_date: date, entry_type: 'workout', completed: false,
  workouts: { name, workout_type: type, duration_minutes: mins, tss: Math.round(mins * 0.9), description: name, intervals: [] },
});
const ride = (name: string, mins: number, tss: number, hoursAgo = 3) => ({
  id: name, strava_activity_id: 1, name, start_date: new Date(Date.now() - hoursAgo * 3600e3).toISOString(),
  distance_meters: mins * 500, moving_time_seconds: mins * 60, average_watts: 230, tss, raw_data: {}, perceived_effort: null,
});

interface Scenario {
  name: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  ask: string;
  plans: any[];
  upcoming: Entry[];
  ridesToday: any[];
  load: { ctl: number; atl: number; tsb: number; status: string };
  checkIn?: any;
  changes?: string[];
  /** What a coach who truly knew the state would do. */
  expect: string;
  /** Hard fails regardless of the judge. */
  mustNot?: RegExp[];
}

const PLAN = { goal_event: 'Stage race', start_date: '2026-10-05', end_date: '2026-12-14', event_date: '2026-12-14', status: 'active', weeks: [], total_weeks: 10 };
const OLD_PLAN_HISTORY = [
  { role: 'user' as const, content: 'Build me a plan for my December stage race.' },
  { role: 'assistant' as const, content: "Done — your stage race plan is built and on your calendar. I set it up for you starting Oct 5, with Thursday VO2 sessions and Saturday long rides." },
  { role: 'user' as const, content: 'Thanks!' },
  { role: 'assistant' as const, content: 'Anytime. Thursday is your first VO2 session — 5×3 min.' },
];

const SCENARIOS: Scenario[] = [
  {
    name: 'Deleted plan, asks for a new one (the Oct 8 incident)',
    history: OLD_PLAN_HISTORY,
    ask: 'Ok, I need a big change. Build me a plan for a 5-day stage race the week before Christmas. I want to remove my current plan.',
    plans: [], upcoming: [], ridesToday: [],
    load: { ctl: 50, atl: 31, tsb: 19, status: 'fresh' },
    changes: ['plan "Stage race" deleted'],
    expect: 'Recognize there is NO current plan (it was deleted) and the calendar is empty; do not claim a plan exists; proceed toward building the new plan (or ask the remaining needed details).',
    mustNot: [/already have (this|that|a|the|your) .*plan/i, /I set (it|this) up for you/i, /on your calendar now/i],
  },
  {
    name: 'Calendar emptied, asks about tomorrow',
    history: OLD_PLAN_HISTORY,
    ask: "What's my workout tomorrow?",
    plans: [], upcoming: [], ridesToday: [],
    load: { ctl: 55, atl: 50, tsb: 5, status: 'productive' },
    changes: ['plan "Stage race" deleted'],
    expect: 'Say nothing is scheduled tomorrow (the plan was removed); may suggest a sensible ride or offer to build/schedule something. Must not describe a scheduled workout as existing.',
    mustNot: [/tomorrow'?s (vo2|threshold|sweet spot|tempo|endurance)/i, /you have .* (scheduled|planned) (for )?tomorrow/i],
  },
  {
    name: 'Workout moved in the app; history says otherwise',
    history: OLD_PLAN_HISTORY,
    ask: 'What am I doing today?',
    plans: [PLAN],
    upcoming: [wk(TODAY, 'Endurance Ride', 'endurance', 90), wk('2026-10-09', 'VO2max Intervals · 5 × 3 min @ 110%', 'vo2max', 75)],
    ridesToday: [],
    load: { ctl: 60, atl: 62, tsb: -2, status: 'productive' },
    changes: ['2 calendar entries added or changed'],
    expect: "Today is a 90-min endurance ride (the VO2 session moved to Friday). Must not say today is VO2.",
    mustNot: [/today'?s vo2/i, /today (is|you have) (a |your )?vo2/i],
  },
  {
    name: 'Already rode hard today, asks what to do',
    history: [{ role: 'user', content: 'Morning!' }, { role: 'assistant', content: 'Morning — threshold intervals on the menu today.' }],
    ask: 'What should I do today?',
    plans: [PLAN],
    upcoming: [wk(TODAY, 'Threshold Intervals · 3 × 12 min @ 93%', 'threshold', 90), wk('2026-10-09', 'Endurance Ride', 'endurance', 90)],
    ridesToday: [ride('Zwift race — Crit City', 70, 120)],
    load: { ctl: 62, atl: 78, tsb: -16, status: 'productive' },
    expect: "Acknowledge the hard ride already done today (a 70-min race, TSS 120) and that it covers/replaces today's threshold session; do NOT prescribe the threshold intervals on top; at most an easy spin or rest.",
    mustNot: [/do (the|your) threshold (intervals|session) (today|now|this afternoon)/i],
  },
  {
    name: 'Deeply fatigued + bad check-in, hard session scheduled',
    history: [],
    ask: 'Ready for today?',
    plans: [PLAN],
    upcoming: [wk(TODAY, 'VO2max Intervals · 6 × 3 min @ 110%', 'vo2max', 75), wk('2026-10-09', 'Endurance Ride', 'endurance', 90)],
    ridesToday: [],
    load: { ctl: 65, atl: 95, tsb: -30, status: 'overreaching' },
    checkIn: { sleep_quality: 'poor', sleep_score: 3, feeling: 'exhausted', feeling_score: 2, notes: 'legs heavy, slept 5h' },
    expect: 'Make the call to NOT do the full VO2 session as written today given TSB -30 and an exhausted check-in — swap to easy/rest or clearly reduce; reference the fatigue/check-in.',
  },
  {
    name: 'Fresh and ready — must not be over-cautious',
    history: [],
    ask: 'Should I do today\'s workout?',
    plans: [PLAN],
    upcoming: [wk(TODAY, 'Threshold Intervals · 3 × 12 min @ 93%', 'threshold', 90)],
    ridesToday: [],
    load: { ctl: 60, atl: 48, tsb: 12, status: 'fresh' },
    checkIn: { sleep_quality: 'great', sleep_score: 9, feeling: 'strong', feeling_score: 9 },
    expect: 'Decisively say yes — do the threshold session as planned; fresh form and a great check-in support it.',
  },
  {
    name: 'Has a plan, asks to build another',
    history: [],
    ask: 'Can you build me a plan for a gran fondo in March?',
    plans: [PLAN],
    upcoming: [wk(TODAY, 'Endurance Ride', 'endurance', 90)],
    ridesToday: [],
    load: { ctl: 60, atl: 55, tsb: 5, status: 'productive' },
    expect: 'Point out the existing active "Stage race" plan (through Dec 14) and ask whether to replace it or plan the fondo after/alongside — do not silently build over it.',
  },
];

function buildContext(s: Scenario): any {
  return {
    athlete: { full_name: 'Eval Rider', ftp: 280, weight_kg: 72, unit_system: 'imperial', experience_level: 'advanced', timezone: TZ, display_mode: 'advanced', date_of_birth: '1988-01-01', weekly_training_hours: 9 },
    recentRides: s.ridesToday, powerRecords: null, ftpEstimation: null,
    trainingStatus: { load: { ctl: s.load.ctl, atl: s.load.atl, tsb: s.load.tsb }, status: { status: s.load.status, description: '', recommendation: '' } },
    upcomingWorkouts: s.upcoming, preferences: {}, healthData: null, dailyCheckIn: s.checkIn ?? null, rpeHistory: [],
    fatigueProfile: null, planDeviations: [], activePlans: s.plans,
  };
}

/** Tools answered from the scenario's data; nothing is written anywhere. */
function fakeTool(s: Scenario, name: string, input: any): any {
  switch (name) {
    case 'get_calendar': return { entries: s.upcoming.map((e) => ({ date: e.scheduled_date, type: e.entry_type, workout: e.workouts?.name ?? null, completed: !!e.completed })) };
    case 'get_recent_activities': return { activities: s.ridesToday.map((r) => ({ name: r.name, start_date: r.start_date, minutes: r.moving_time_seconds / 60, tss: r.tss })) };
    case 'generate_training_plan':
      // Mirrors the production code check in aiToolExecutor.
      if (s.plans.length && !['replace', 'keep_both'].includes(input?.existing_plan_action)) {
        return { success: false, error: 'ACTIVE_PLAN_EXISTS', message: `The athlete already has an active plan "${s.plans[0].goal_event}". Do NOT build yet — ask REPLACE or KEEP BOTH, then call again with existing_plan_action.` };
      }
      return { success: true, status: 'queued', message: 'Plan build started in the background; it will appear on the calendar in 1–3 minutes.' };
    default: return { success: true, note: `(eval) ${name} accepted`, input };
  }
}

async function runScenario(s: Scenario) {
  const ctx = buildContext(s);
  const system = aiCoachService.buildSystemPromptWithTools(ctx, TODAY);
  const live = formatLiveState({
    nowLabel: 'Thursday, October 8, 2026', todayIso: TODAY, activePlans: s.plans, upcoming: s.upcoming,
    load: s.load, ridesToday: s.ridesToday,
    checkIn: s.checkIn ? `sleep ${s.checkIn.sleep_quality}, feeling ${s.checkIn.feeling}${s.checkIn.notes ? `, notes: "${s.checkIn.notes}"` : ''}` : null,
    lastCoachReplyAt: s.history.length ? 'Oct 7, 5:24 PM' : null, changes: s.changes || [],
  });
  const messages: any[] = [...s.history, { role: 'user', content: `${live}\n\n${s.ask}` }];
  const toolsUsed: string[] = [];

  let reply = '';
  for (let i = 0; i < 4; i++) {
    const resp: any = await anthropic.messages.create({ model: SONNET, max_tokens: 1500, system, messages, tools: AI_TOOLS as any });
    const text = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    const uses = resp.content.filter((b: any) => b.type === 'tool_use');
    if (!uses.length) { reply = text; break; }
    messages.push({ role: 'assistant', content: resp.content });
    messages.push({ role: 'user', content: uses.map((u: any) => { toolsUsed.push(u.name); return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(fakeTool(s, u.name, u.input)) }; }) });
    reply = text;
  }

  // Same state-claim guard as production.
  const facts: StateFacts = {
    activePlans: s.plans.length,
    upcomingWorkouts: s.upcoming.filter((e) => e.entry_type !== 'rest').length,
    workoutToday: s.upcoming.some((e) => e.scheduled_date === TODAY && e.entry_type !== 'rest'),
    rodeToday: s.ridesToday.length > 0,
  };
  const pending = toolsUsed.some((t) => ['generate_training_plan', 'schedule_plan_from_templates', 'schedule_training_plan_template'].includes(t));
  const problems = findStateContradictions(reply, facts, { stateChangePending: pending });
  let final = reply;
  if (problems.length) {
    const fix: any = await anthropic.messages.create({
      model: SONNET, max_tokens: 1500, system,
      messages: [...messages, { role: 'assistant', content: reply || '(no text)' },
        { role: 'user', content: `[STATE CHECK FAILED — automated, not from the athlete]\n${problems.map((p) => `- ${p}`).join('\n')}\nThe database right now: ${describeFacts(facts)}.\nRewrite your whole reply to the athlete from scratch, based ONLY on the real current state. Keep everything else that was right. Do not mention this check or apologise for it.` }],
    });
    final = fix.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  }

  // Grade.
  const hardFails = (s.mustNot || []).filter((p) => p.test(final)).map((p) => `matched forbidden ${p}`);
  const judge: any = await anthropic.messages.create({
    model: SONNET, max_tokens: 300,
    messages: [{ role: 'user', content:
`You grade an AI cycling coach's reply for STATE AWARENESS. Be strict but fair.
TRUE CURRENT STATE: ${describeFacts(facts)}. Plans: ${s.plans.map((p) => p.goal_event).join(', ') || 'none'}. Calendar: ${s.upcoming.map((e) => `${e.scheduled_date} ${e.workouts?.name}`).join('; ') || 'empty'}. Rides today: ${s.ridesToday.map((r) => `${r.name} (${r.moving_time_seconds / 60}min, TSS ${r.tss})`).join('; ') || 'none'}. Load: CTL ${s.load.ctl}, ATL ${s.load.atl}, TSB ${s.load.tsb}. Check-in: ${s.checkIn ? JSON.stringify(s.checkIn) : 'none'}. Changes the athlete made since the coach's last reply: ${(s.changes || []).join('; ') || 'none'}.
ATHLETE ASKED: ${s.ask}
A COACH WHO TRULY KNEW THE STATE WOULD: ${s.expect}
COACH REPLIED: """${final}"""
Respond with ONLY JSON: {"pass": true|false, "reason": "<one sentence>"}` }],
  });
  const raw = judge.content.find((b: any) => b.type === 'text')?.text || '{}';
  let verdict = { pass: false, reason: 'judge returned no JSON' };
  try { verdict = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { /* keep default */ }

  return { s, final, raw: reply, guarded: problems, toolsUsed, hardFails, verdict, pass: verdict.pass && hardFails.length === 0 };
}

(async () => {
  const selected = SCENARIOS.filter((s) => !ONLY || s.name.toLowerCase().includes(ONLY));
  console.log(`Coach awareness eval — ${selected.length} scenarios, live ${SONNET}\n`);
  const results = await Promise.all(selected.map((s) => runScenario(s).catch((e) => ({ s, error: String(e?.message || e) }) as any)));
  let fails = 0;
  for (const r of results) {
    if (r.error) { fails++; console.log(`✗ ${r.s.name}\n    ERROR: ${r.error}`); continue; }
    if (!r.pass) fails++;
    console.log(`${r.pass ? '✓' : '✗'} ${r.s.name}`);
    console.log(`    ${r.verdict.reason}${r.hardFails.length ? ` | HARD FAIL: ${r.hardFails.join('; ')}` : ''}`);
    if (r.guarded.length) console.log(`    (guard rewrote the reply: ${r.guarded.join(' / ')})`);
    if (r.toolsUsed.length) console.log(`    tools: ${r.toolsUsed.join(', ')}`);
    if (VERBOSE || !r.pass) console.log(`    REPLY: ${r.final.replace(/\n+/g, ' ').slice(0, 600)}`);
  }
  console.log(`\n${fails === 0 ? 'ALL SCENARIOS PASS' : `${fails} scenario(s) failed`}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
