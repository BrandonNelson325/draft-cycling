/**
 * Coach-initiated ride debriefs: the coach reaches out (chat message + push)
 * when the athlete leaves post-ride notes or an FTP test is read — once per
 * ride, and never on top of a debrief the athlete started themselves.
 *
 * Run: npm run test:debrief
 */
import { shouldDebrief, buildDebriefPrompt, coachDebriefService } from '../services/coachDebriefService';
import { aiCoachService } from '../services/aiCoachService';
import { anthropic } from '../utils/anthropic';
import { supabaseAdmin } from '../utils/supabase';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

const FTP_NOTE = 'FTP test: best 20 min 294W → 279W is well below current 299W — FTP held; worth a chat with your coach';

(async () => {
  // ---- When to reach out ----
  check('Nothing to say: no notes, not an FTP test', !shouldDebrief({ notes: null, ftpTestNote: null }));
  check('Whitespace-only notes are not notes', !shouldDebrief({ notes: '   ', ftpTestNote: null }));
  check('Post-ride notes → reach out', shouldDebrief({ notes: 'I fell apart', ftpTestNote: null }));
  check('FTP test result → reach out', shouldDebrief({ notes: null, ftpTestNote: FTP_NOTE }));

  const prompt = buildDebriefPrompt({
    name: 'Zwift', date: '2026-10-15', minutes: 60, avgWatts: 205, tss: 70, rpe: 5,
    notes: 'I fell apart. Had to take 2 1 min breaks during the 20', plannedName: 'FTP Test · 20 min', ftpTestNote: FTP_NOTE,
  });
  check('Prompt carries the athlete notes verbatim', prompt.includes('Had to take 2 1 min breaks'));
  check('RPE shown on the 1–5 scale', prompt.includes('5/5'));
  check('Prompt explains a held FTP result and asks for a retest offer', prompt.includes('FTP TEST RESULT') && /retest/.test(prompt));
  check('Prompt forbids claiming calendar changes', /OFFER it — do not claim/.test(prompt));

  // ---- debriefRide with DB, model and push mocked ----
  type Rows = { ride: any; entry: any; recentUserMsgs: any[]; claimWins: boolean };
  const inserts: { table: string; data: any }[] = [];
  let modelCalls = 0;
  const pushes: any[] = [];

  const install = (r: Rows) => {
    inserts.length = 0; modelCalls = 0; pushes.length = 0;
    (supabaseAdmin as any).from = (table: string) => {
      let op = 'select';
      const b: any = {
        select: () => b, eq: () => b, gte: () => b, is: () => b, order: () => b, limit: () => b,
        update: () => { op = 'update'; return b; },
        insert: (data: any) => { inserts.push({ table, data }); op = 'insert'; return b; },
        maybeSingle: async () => ({ data: table === 'strava_activities' ? r.ride : table === 'calendar_entries' ? r.entry : null, error: null }),
        single: async () => ({ data: table === 'athletes' ? { push_token: 'tok', push_notifications_enabled: true } : { id: 'conv-new' }, error: null }),
        then: (resolve: any) => {
          if (table === 'strava_activities' && op === 'update') return resolve({ data: r.claimWins ? [{ id: 'r1' }] : [], error: null });
          if (table === 'chat_messages' && op === 'select') return resolve({ data: r.recentUserMsgs, error: null });
          if (table === 'chat_conversations' && op === 'select') return resolve({ data: [{ id: 'conv-1' }], error: null });
          return resolve({ data: [], error: null });
        },
      };
      return b;
    };
  };
  (aiCoachService as any).buildAthleteContext = async () => ({});
  (aiCoachService as any).buildSystemPrompt = () => 'SYSTEM';
  (anthropic.messages as any).create = async () => { modelCalls++; return { content: [{ type: 'text', text: 'Tough day — two stops means the test, not your fitness. Retest Friday?' }] }; };
  (global as any).fetch = async (_url: string, init: any) => { pushes.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ data: { status: 'ok' } }) }; };

  const ride = { id: 'r1', strava_activity_id: 1, name: 'Zwift', start_date: new Date(Date.now() - 3 * 3600_000).toISOString(), moving_time_seconds: 3600, average_watts: 205, tss: 70, perceived_effort: 5, post_activity_notes: 'I fell apart', acknowledged_at: '2026-10-15T13:15:08Z', coach_debrief_at: null };

  install({ ride: { ...ride, post_activity_notes: null }, entry: null, recentUserMsgs: [], claimWins: true });
  check('Plain ride, no notes → no message, no model call', (await coachDebriefService.debriefRide('a', 1)) === 'nothing_to_say' && modelCalls === 0 && inserts.length === 0);

  install({ ride, entry: { notes: FTP_NOTE, workouts: { name: 'FTP Test' } }, recentUserMsgs: [], claimWins: true });
  const sent = await coachDebriefService.debriefRide('a', 1);
  const msg = inserts.find((i) => i.table === 'chat_messages')?.data;
  check('Notes + FTP test → one coach message posted', sent === 'sent' && modelCalls === 1 && msg?.role === 'assistant' && msg?.conversation_id === 'conv-1');
  check('Push sent, titled for the FTP test, opens Chat', pushes.length === 1 && pushes[0].title === 'Your FTP test result' && pushes[0].data?.screen === 'Chat');

  install({ ride, entry: null, recentUserMsgs: [{ id: 'm' }], claimWins: true });
  check('Athlete already debriefing in chat → skipped', (await coachDebriefService.debriefRide('a', 1)) === 'athlete_in_chat' && modelCalls === 0);

  install({ ride, entry: null, recentUserMsgs: [], claimWins: false });
  check('Another trigger claimed the ride first → no duplicate', (await coachDebriefService.debriefRide('a', 1)) === 'already_debriefed' && modelCalls === 0 && inserts.length === 0);

  install({ ride: { ...ride, coach_debrief_at: '2026-10-15T13:16:00Z' }, entry: null, recentUserMsgs: [], claimWins: true });
  check('Already debriefed ride → never again', (await coachDebriefService.debriefRide('a', 1)) === 'already_debriefed' && modelCalls === 0);

  install({ ride: { ...ride, start_date: new Date(Date.now() - 10 * 86_400_000).toISOString() }, entry: null, recentUserMsgs: [], claimWins: true });
  check('Ride from 10 days ago (re-rated in its sheet) → no surprise message', (await coachDebriefService.debriefRide('a', 1)) === 'too_old' && modelCalls === 0);

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
