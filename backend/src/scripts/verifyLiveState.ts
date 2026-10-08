/**
 * The coach must work from CURRENT truth, not its own chat history.
 *
 * Incident (Oct 8 2026): athlete deleted every plan, then asked for a new one;
 * the coach replied "You already have this plan built and running — I set it up
 * October 4th" without checking. Root cause: current state was one quiet line in
 * a long system prompt, an empty calendar produced no text at all, and 50
 * messages of history confidently described the old plan.
 *
 * Run: npm run test:live-state
 */
import { formatLiveState } from '../utils/liveState';
import { aiCoachService } from '../services/aiCoachService';
import { supabaseAdmin } from '../utils/supabase';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

(async () => {
  // ---- Pure formatting ----
  const empty = formatLiveState({
    nowLabel: 'Wednesday, October 8, 2026', todayIso: '2026-10-08',
    activePlans: [], upcoming: [{ scheduled_date: '2026-10-11', entry_type: 'rest' }],
    load: { ctl: 72, atl: 85, tsb: -13, status: 'productive' }, ridesToday: [], changes: [],
  });
  check('No plans → says NONE explicitly', /Active training plans: NONE/.test(empty));
  check('No workouts → says EMPTY explicitly (rest markers ≠ workouts)', /Calendar from today: EMPTY/.test(empty) && /1 rest-day marker/.test(empty));
  check('States that live state beats past messages', /THIS wins/.test(empty) && /your own past messages/.test(empty));
  check('Carries load / freshness', /CTL 72, fatigue ATL 85, form TSB -13/.test(empty));

  const busy = formatLiveState({
    nowLabel: 'x', todayIso: '2026-10-08',
    activePlans: [{ goal_event: 'Stage race', start_date: '2026-10-12', end_date: '2026-12-14' }],
    upcoming: [
      { scheduled_date: '2026-10-08', entry_type: 'workout', workouts: { name: 'VO2max Intervals', duration_minutes: 75 } },
      { scheduled_date: '2026-10-09', entry_type: 'workout', workouts: { name: 'Endurance', duration_minutes: 90 } },
    ],
    ridesToday: [{ name: 'Morning Ride', moving_time_seconds: 3600, tss: 55 }],
    changes: ['plan "Old plan" deleted (×4)'], lastCoachReplyAt: 'Oct 7, 5:24 PM',
  });
  check('Lists the active plan', /"Stage race" \(2026-10-12 → 2026-12-14\)/.test(busy));
  check("Today's workout + next up", /Today's scheduled workout: 2026-10-08 VO2max Intervals \(75min\)/.test(busy) && /Next up: 2026-10-09 Endurance/.test(busy));
  check('Reports what changed since the last reply', /CHANGED since your last reply \(Oct 7, 5:24 PM\): plan "Old plan" deleted \(×4\)/.test(busy));
  check("Today's ride included", /Ridden today: "Morning Ride" 60min TSS 55/.test(busy));

  // ---- Replay the incident through the real history + live-state code ----
  const history = [
    { role: 'assistant', content: 'Your stage race plan is built and on your calendar — I set it up for you.', created_at: '2026-10-04T13:31:00+00:00' },
    { role: 'user', content: 'thanks', created_at: '2026-10-07T17:24:31+00:00' },
    { role: 'assistant', content: "Skip the ride today.", created_at: '2026-10-07T17:24:34+00:00' },
  ];
  const cancelled = Array.from({ length: 4 }, () => ({
    goal_event: '5-6 day stage race, green jersey / sprint points focus', status: 'cancelled',
    created_at: '2026-10-04T13:30:26+00:00', updated_at: '2026-10-08T13:47:07+00:00',
  }));
  let sinceSeen: string | null = null;
  (supabaseAdmin as any).from = (table: string) => {
    const b: any = {
      select: () => b, eq: () => b, gt: (_c: string, v: string) => { sinceSeen = v; return b; }, order: () => b, limit: () => b,
      then: (resolve: any) => resolve(
        table === 'chat_messages' ? { data: [...history].reverse(), error: null }
        : table === 'training_plans' ? { data: cancelled, error: null }
        : table === 'calendar_entries' ? { data: null, count: 0, error: null }
        : { data: null, error: null }),
    };
    return b;
  };
  const context: any = {
    athlete: { timezone: 'America/Denver' }, activePlans: [], upcomingWorkouts: [], recentRides: [],
    trainingStatus: { load: { ctl: 72, atl: 85, tsb: -13 }, status: { status: 'productive' } }, dailyCheckIn: null,
  };
  const ask = 'Build me a plan for a 5-6 day stage race the week before Christmas.';
  const messages = await aiCoachService.buildMessageHistory('conv', ask, 'America/Denver', '2026-10-08',
    (since) => aiCoachService.buildLiveState('athlete', context, 'America/Denver', '2026-10-08', since));
  const last = messages[messages.length - 1];
  check('Newest message = LIVE STATE + the athlete\'s words', last.role === 'user' && last.content.startsWith('[LIVE STATE') && last.content.endsWith(ask));
  check('"Since" = the coach\'s last reply, URL-safe (no "+")', sinceSeen === '2026-10-07T17:24:34.000Z', String(sinceSeen));
  check('Coach is told the plans were deleted', /CHANGED since your last reply.*plan "5-6 day stage race, green jersey \/ sprint points focus" deleted \(×4\)/.test(last.content));
  check('Coach is told there is no plan and an empty calendar', /Active training plans: NONE/.test(last.content) && /Calendar from today: EMPTY/.test(last.content));

  // A failing snapshot must never block the message.
  const safe = await aiCoachService.buildMessageHistory('conv', ask, 'America/Denver', '2026-10-08', async () => { throw new Error('db down'); });
  check('Snapshot failure → message still sent unchanged', safe[safe.length - 1].content === ask);

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
