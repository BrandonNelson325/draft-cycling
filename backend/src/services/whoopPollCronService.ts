import cron from 'node-cron';
import { supabaseAdmin } from '../utils/supabase';
import { whoopService } from './whoopService';
import { logger } from '../utils/logger';
import { todayInTimezone } from '../utils/timezone';

/**
 * WHOOP morning poll — the server-side backup to webhooks.
 *
 * Without it, today's recovery was only pulled when the athlete opened the app
 * (ensureFresh), so the recovery push + coach call arrived AFTER they opened
 * Draft instead of when WHOOP scored their sleep. Every 5 minutes during the
 * morning window, any WHOOP athlete still missing today's recovery is synced;
 * syncDays fires notifyRecovery the moment it first lands. Once today is
 * stored the athlete is skipped, so this costs nothing for the rest of the day.
 */
export const WHOOP_POLL_START_HOUR = 3;
export const WHOOP_POLL_END_HOUR = 13; // exclusive — the noon "missing" nudge covers no-shows

function localHour(tz: string): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  } catch {
    return new Date().getUTCHours();
  }
}

/** Pure: should this athlete be polled right now? */
export function shouldPollWhoop(hour: number, haveTodayRecovery: boolean): boolean {
  return !haveTodayRecovery && hour >= WHOOP_POLL_START_HOUR && hour < WHOOP_POLL_END_HOUR;
}

let running = false;

export function startWhoopPollCron() {
  cron.schedule('*/5 * * * *', async () => {
    if (running) return; // a slow WHOOP API must never stack runs
    running = true;
    try {
      const { data: athletes, error } = await supabaseAdmin
        .from('athletes')
        .select('id, timezone')
        .not('whoop_access_token', 'is', null);
      if (error) { logger.error('[WhoopPoll] Error querying athletes:', error.message); return; }

      for (const a of athletes || []) {
        const tz = (a.timezone as string) || 'America/Los_Angeles';
        const hour = localHour(tz);
        if (hour < WHOOP_POLL_START_HOUR || hour >= WHOOP_POLL_END_HOUR) continue;
        const { data: row } = await supabaseAdmin
          .from('daily_metrics').select('wellness_source, readiness_score')
          .eq('athlete_id', a.id).eq('date', todayInTimezone(tz)).maybeSingle();
        const haveToday = row?.wellness_source === 'whoop' && row?.readiness_score != null;
        if (!shouldPollWhoop(hour, haveToday)) continue;
        await whoopService.syncDays(a.id, 2, 'poll')
          .catch((e) => logger.warn(`[WhoopPoll] sync failed for ${a.id}:`, e?.message));
      }
    } catch (err: any) {
      logger.error('[WhoopPoll] Fatal error:', err?.message || err);
    } finally {
      running = false;
    }
  });
  logger.info('[WhoopPoll] WHOOP morning poll started (every 5 min, 3am–1pm local)');
}
