import cron from 'node-cron';
import { supabaseAdmin } from '../utils/supabase';
import { sendMorningCheckInNotification } from './pushNotificationService';
import { logger } from '../utils/logger';

/**
 * Returns the current local time as "HH:MM" for the given IANA timezone.
 * Falls back to UTC if the timezone is invalid.
 */
function currentLocalHHMM(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hh = parts.find(p => p.type === 'hour')?.value || '00';
    const mm = parts.find(p => p.type === 'minute')?.value || '00';
    return `${hh}:${mm}`;
  } catch {
    // Invalid timezone — fall back to UTC
    const now = new Date();
    return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
  }
}

export function startMorningCheckInCron() {
  // Runs every minute
  cron.schedule('* * * * *', async () => {
    try {
      // Find athletes with push enabled and a morning check-in time set
      const { data: athletes, error } = await supabaseAdmin
        .from('athletes')
        .select('id, morning_checkin_time, timezone')
        .eq('push_notifications_enabled', true)
        .not('push_token', 'is', null)
        .not('morning_checkin_time', 'is', null);

      if (error) {
        logger.error('[MorningCron] Error querying athletes:', error);
        return;
      }

      if (!athletes || athletes.length === 0) return;

      for (const athlete of athletes) {
        // morning_checkin_time is a TIME string like "07:00:00" — compare HH:MM portion
        const checkinHHMM = (athlete.morning_checkin_time as string).slice(0, 5);
        const tz = (athlete.timezone as string) || 'UTC';
        const localNow = currentLocalHHMM(tz);
        if (checkinHHMM === localNow) {
          try {
            await sendMorningCheckInNotification(athlete.id);
          } catch (err) {
            logger.error(`[MorningCron] Failed to notify athlete ${athlete.id}:`, err);
          }
        }
      }
    } catch (err) {
      logger.error('[MorningCron] Fatal error:', err);
    }
  });

  logger.info('[MorningCron] Morning check-in cron started (runs every minute)');
}
