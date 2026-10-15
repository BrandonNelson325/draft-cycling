/**
 * Coach-initiated ride debriefs.
 *
 * Why this exists: an athlete who writes "I fell apart, had to stop twice" in
 * post-ride feedback, or who just did an FTP test, heard nothing back until
 * they opened a chat themselves — the result sat in a calendar note and the
 * coach's context. Now the coach reaches out first: one chat message + a push.
 *
 * At most one debrief per ride: `strava_activities.coach_debrief_at` is claimed
 * atomically (migration 043). Skipped when the athlete is already debriefing
 * in chat (tapped "Debrief with coach", or chatted since giving feedback).
 */
import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';
import { anthropic, SONNET } from '../utils/anthropic';
import { sendPushNotification } from './pushNotificationService';
import { FTP_TEST_NOTE_PREFIX } from './ftpTestService';

/** Seconds to wait after feedback before reaching out, so a debrief the athlete
 *  starts themselves (popup button → chat) wins and ours is skipped. */
export const DEBRIEF_DELAY_MS = 20_000;
/** Only recent rides get a coach-initiated debrief. */
const MAX_RIDE_AGE_MS = 3 * 86_400_000;

export interface DebriefFacts {
  notes: string | null;
  /** The calendar note written by ftpTestService, if this ride was a processed FTP test. */
  ftpTestNote: string | null;
}

/** Pure: is there anything worth the coach reaching out about? */
export function shouldDebrief(f: DebriefFacts): boolean {
  return !!(f.notes && f.notes.trim()) || !!f.ftpTestNote;
}

/** Pure: the event description handed to the coach. */
export function buildDebriefPrompt(ride: {
  name: string | null;
  date: string;
  minutes: number | null;
  avgWatts: number | null;
  tss: number | null;
  rpe: number | null;
  notes: string | null;
  plannedName: string | null;
  ftpTestNote: string | null;
}): string {
  const lines = [
    `[COACH-INITIATED DEBRIEF] The athlete did NOT send a message. Their ride just synced and you are reaching out first.`,
    ``,
    `RIDE: "${ride.name || 'Ride'}" on ${ride.date}${ride.minutes ? `, ${ride.minutes} min` : ''}${ride.avgWatts ? `, avg ${Math.round(ride.avgWatts)}W` : ''}${ride.tss ? `, TSS ${Math.round(ride.tss)}` : ''}`,
  ];
  if (ride.plannedName) lines.push(`PLANNED: ${ride.plannedName}`);
  if (ride.rpe) lines.push(`ATHLETE RPE: ${ride.rpe}/5 (5 = maximal)`);
  if (ride.notes?.trim()) lines.push(`ATHLETE'S POST-RIDE NOTES: "${ride.notes.trim()}"`);
  if (ride.ftpTestNote) {
    lines.push(`FTP TEST RESULT: ${ride.ftpTestNote}`);
    lines.push(`(FTP = 95% of best 20-min power. A result >5% below current FTP is held, not applied, because it usually means the test went wrong — fatigue, pacing, stops — rather than lost fitness.)`);
  }
  lines.push(
    ``,
    `Write the message you send them now:`,
    `- Respond directly to what they told you (their notes/RPE) — that is why you're reaching out.`,
    ride.ftpTestNote
      ? `- Explain the FTP result plainly: what their FTP is now and why. If it went up, name the new targets. If it was held, say why and offer a retest (suggest a sensible day from their calendar).`
      : `- Connect the ride to their plan and recovery.`,
    `- End with ONE concrete next step or question. If you'd change the calendar, OFFER it — do not claim it's done.`,
    `- Short: up to 6 sentences even in simple display mode — spend them on what they reported, not a list of stats. No greeting fluff, no headers.`,
  );
  return lines.join('\n');
}

async function latestConversationId(athleteId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('chat_conversations')
    .select('id')
    .eq('athlete_id', athleteId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (data?.[0]?.id) return data[0].id;
  const { data: created, error } = await supabaseAdmin
    .from('chat_conversations')
    .insert({ athlete_id: athleteId, title: 'Ride debrief', last_message_at: new Date().toISOString() })
    .select('id')
    .single();
  if (error || !created) throw new Error(`Could not create conversation: ${error?.message}`);
  return created.id;
}

export const coachDebriefService = {
  /** Fire-and-forget wrapper used by triggers. */
  schedule(athleteId: string, stravaActivityId: number | string, delayMs = DEBRIEF_DELAY_MS): void {
    setTimeout(() => {
      this.debriefRide(athleteId, stravaActivityId).catch((err) =>
        logger.error(`[Debrief] Failed for ${athleteId}/${stravaActivityId}:`, err)
      );
    }, delayMs);
  },

  /** Returns what happened, for logs/tests. */
  async debriefRide(athleteId: string, stravaActivityId: number | string): Promise<string> {
    const { data: ride } = await supabaseAdmin
      .from('strava_activities')
      .select('id, strava_activity_id, name, start_date, moving_time_seconds, average_watts, tss, perceived_effort, post_activity_notes, acknowledged_at, coach_debrief_at')
      .eq('athlete_id', athleteId)
      .eq('strava_activity_id', stravaActivityId)
      .maybeSingle();
    if (!ride) return 'no_ride';
    if ((ride as any).coach_debrief_at) return 'already_debriefed';
    // Re-rating an old ride from its detail sheet also "acknowledges" it — don't
    // surprise the athlete with a message about a ride from weeks ago.
    if (Date.now() - new Date(ride.start_date).getTime() > MAX_RIDE_AGE_MS) return 'too_old';

    const { data: entry } = await supabaseAdmin
      .from('calendar_entries')
      .select('notes, workouts(name)')
      .eq('athlete_id', athleteId)
      .eq('strava_activity_id', stravaActivityId)
      .limit(1)
      .maybeSingle();
    const entryNotes: string = (entry as any)?.notes || '';
    const ftpTestNote = entryNotes.startsWith(FTP_TEST_NOTE_PREFIX) ? entryNotes : null;

    if (!shouldDebrief({ notes: ride.post_activity_notes, ftpTestNote })) return 'nothing_to_say';

    // Already debriefing live? (popup "Debrief with coach" → chat, or just chatting.)
    if (ride.acknowledged_at) {
      const since = new Date(new Date(ride.acknowledged_at).getTime() - 5000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from('chat_messages')
        .select('id')
        .eq('athlete_id', athleteId)
        .eq('role', 'user')
        .gte('created_at', since)
        .limit(1);
      if (recent?.length) return 'athlete_in_chat';
    }

    // Claim the ride — only one debrief, even if two triggers race.
    const now = new Date().toISOString();
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('strava_activities')
      .update({ coach_debrief_at: now })
      .eq('id', ride.id)
      .is('coach_debrief_at', null)
      .select('id');
    if (claimErr) {
      logger.error('[Debrief] Claim failed (is migration 043 applied?):', claimErr.message);
      return 'claim_failed';
    }
    if (!claimed?.length) return 'already_debriefed';

    // Lazy import: aiCoachService → ftpEstimationService → ftpTestService → (dynamic) this.
    const { aiCoachService } = await import('./aiCoachService');
    const context = await aiCoachService.buildAthleteContext(athleteId);
    const system = aiCoachService.buildSystemPrompt(context);
    const convId = await latestConversationId(athleteId);

    // Recent turns so the coach doesn't repeat itself or contradict last night's chat.
    const { data: history } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(6);
    const turns = (history || []).reverse()
      .map((m: any) => `${m.role === 'user' ? 'ATHLETE' : 'COACH'}: ${String(m.content).slice(0, 600)}`)
      .join('\n');

    const prompt = buildDebriefPrompt({
      name: ride.name,
      date: String(ride.start_date).split('T')[0],
      minutes: ride.moving_time_seconds ? Math.round(ride.moving_time_seconds / 60) : null,
      avgWatts: ride.average_watts,
      tss: ride.tss,
      rpe: ride.perceived_effort,
      notes: ride.post_activity_notes,
      plannedName: (entry as any)?.workouts?.name || null,
      ftpTestNote,
    });

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: (turns ? `RECENT CHAT (for continuity):\n${turns}\n\n` : '') + prompt }],
    });
    const text = response.content.find((c: any) => c.type === 'text') as any;
    const content: string = text?.text?.trim();
    if (!content) {
      // Release the claim so a later trigger can retry.
      await supabaseAdmin.from('strava_activities').update({ coach_debrief_at: null }).eq('id', ride.id);
      return 'empty_response';
    }

    await supabaseAdmin.from('chat_messages').insert({
      conversation_id: convId,
      athlete_id: athleteId,
      role: 'assistant',
      content,
    });
    await supabaseAdmin.from('chat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId);

    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('push_token, push_notifications_enabled')
      .eq('id', athleteId)
      .single();
    if (athlete?.push_token && athlete.push_notifications_enabled) {
      const title = ftpTestNote ? 'Your FTP test result' : 'Your coach on today\'s ride';
      const body = content.length > 140 ? `${content.slice(0, 137)}…` : content;
      await sendPushNotification(athlete.push_token, title, body, { screen: 'Chat', type: 'coach_debrief' })
        .catch((err) => logger.warn('[Debrief] Push failed:', err));
    }

    logger.info(`[Debrief] Coach reached out to ${athleteId} about ${stravaActivityId}${ftpTestNote ? ' (FTP test)' : ''}`);
    return 'sent';
  },
};
