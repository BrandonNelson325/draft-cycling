import cron from 'node-cron';
import { supabaseAdmin } from '../utils/supabase';
import { sendMorningCheckInNotification } from './pushNotificationService';
import { logger } from '../utils/logger';

/**
 * Returns the current UTC time as "HH:MM" for matching against morning_checkin_time.
 */
function currentUTCHHMM(): string {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function startMorningCheckInCron() {
  // Runs every minute
  cron.schedule('* * * * *', async () => {
    const currentTime = currentUTCHHMM();

    try {
      // Find athletes whose morning check-in time matches the current UTC HH:MM
      const { data: athletes, error } = await supabaseAdmin
        .from('athletes')
        .select('id, morning_checkin_time')
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
        if (checkinHHMM === currentTime) {
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
