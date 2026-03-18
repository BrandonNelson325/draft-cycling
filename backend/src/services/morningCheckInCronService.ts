import cron from 'node-cron';
import { supabaseAdmin } from '../utils/supabase';
import { sendMorningCheckInNotification, sendMorningCheckInReminder } from './pushNotificationService';
import { logger } from '../utils/logger';
import { todayInTimezone } from '../utils/timezone';

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

/**
 * Add hours to a "HH:MM" string, returning a new "HH:MM" string.
 */
function addHoursToHHMM(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const totalMinutes = h * 60 + m + hours * 60;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Check if athlete has completed their daily check-in for today.
 */
async function hasCheckedInToday(athleteId: string, todayDate: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('daily_metrics')
    .select('check_in_completed')
    .eq('athlete_id', athleteId)
    .eq('date', todayDate)
    .single();
  return !!data?.check_in_completed;
}

export function startMorningCheckInCron() {
  // Runs every minute
  cron.schedule('* * * * *', async () => {
    try {
      // Find athletes with push enabled and a morning check-in time set
      const { data: athletes, error } = await supabaseAdmin
        .from('athletes')
        .select('id, morning_checkin_time, timezone, morning_notif_sent_date, morning_reminder_sent_date')
        .eq('push_notifications_enabled', true)
        .not('push_token', 'is', null)
        .not('morning_checkin_time', 'is', null);

      if (error) {
        logger.error('[MorningCron] Error querying athletes:', error);
        return;
      }

      if (!athletes || athletes.length === 0) return;

      for (const athlete of athletes) {
        const checkinHHMM = (athlete.morning_checkin_time as string).slice(0, 5);
        const tz = (athlete.timezone as string) || 'UTC';
        const localNow = currentLocalHHMM(tz);
        const todayDate = todayInTimezone(tz);
        const alreadySentToday = athlete.morning_notif_sent_date === todayDate;
        const alreadyRemindedToday = athlete.morning_reminder_sent_date === todayDate;

        // --- Initial notification: send once when time matches ---
        if (!alreadySentToday && checkinHHMM === localNow) {
          try {
            // Skip if they already completed the check-in (e.g., opened the app early)
            const alreadyDone = await hasCheckedInToday(athlete.id, todayDate);
            if (!alreadyDone) {
              await sendMorningCheckInNotification(athlete.id);
            }
            // Mark as sent for today regardless, so we don't re-send
            await supabaseAdmin
              .from('athletes')
              .update({ morning_notif_sent_date: todayDate })
              .eq('id', athlete.id);
          } catch (err) {
            logger.error(`[MorningCron] Failed to notify athlete ${athlete.id}:`, err);
          }
          continue;
        }

        // --- Reminder: 4 hours after initial, if not completed and not yet reminded ---
        if (alreadySentToday && !alreadyRemindedToday) {
          const reminderHHMM = addHoursToHHMM(checkinHHMM, 4);
          if (reminderHHMM === localNow) {
            try {
              // Check if they already filled it out
              const completed = await hasCheckedInToday(athlete.id, todayDate);
              if (completed) continue;

              await sendMorningCheckInReminder(athlete.id);
              await supabaseAdmin
                .from('athletes')
                .update({ morning_reminder_sent_date: todayDate })
                .eq('id', athlete.id);
            } catch (err) {
              logger.error(`[MorningCron] Failed to send reminder to athlete ${athlete.id}:`, err);
            }
          }
        }
      }
    } catch (err) {
      logger.error('[MorningCron] Fatal error:', err);
    }
  });

  logger.info('[MorningCron] Morning check-in cron started (runs every minute)');
}
