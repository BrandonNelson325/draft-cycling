import cron from 'node-cron';
import { supabaseAdmin } from '../utils/supabase';
import { sendActivityFeedbackReminder } from './pushNotificationService';
import { logger } from '../utils/logger';

const REMINDER_DELAY_HOURS = 4;

/**
 * Cron that checks for unacknowledged activities that were notified 4+ hours ago
 * and sends a single reminder. Runs every 5 minutes.
 */
export function startActivityReminderCron() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - REMINDER_DELAY_HOURS * 60 * 60 * 1000).toISOString();

      // Find activities that:
      // 1. Had a notification sent
      // 2. Were notified more than 4 hours ago
      // 3. Have NOT been acknowledged
      // 4. Have NOT already received a reminder
      const { data: activities, error } = await supabaseAdmin
        .from('strava_activities')
        .select('id, athlete_id')
        .not('notification_sent_at', 'is', null)
        .lte('notification_sent_at', cutoff)
        .is('acknowledged_at', null)
        .is('reminder_sent_at', null);

      if (error) {
        logger.error('[ActivityReminderCron] Error querying activities:', error);
        return;
      }

      if (!activities || activities.length === 0) return;

      // Group by athlete to send at most one reminder per athlete
      const athleteIds = [...new Set(activities.map(a => a.athlete_id))];

      for (const athleteId of athleteIds) {
        try {
          // Check that athlete still has push enabled
          const { data: athlete } = await supabaseAdmin
            .from('athletes')
            .select('push_notifications_enabled, push_token')
            .eq('id', athleteId)
            .single();

          if (!athlete?.push_notifications_enabled || !athlete?.push_token) continue;

          await sendActivityFeedbackReminder(athleteId);

          // Mark all this athlete's pending activities as reminded
          const athleteActivityIds = activities
            .filter(a => a.athlete_id === athleteId)
            .map(a => a.id);

          await supabaseAdmin
            .from('strava_activities')
            .update({ reminder_sent_at: new Date().toISOString() })
            .in('id', athleteActivityIds);

          logger.info(`[ActivityReminderCron] Reminder sent to athlete ${athleteId} for ${athleteActivityIds.length} activity(ies)`);
        } catch (err) {
          logger.error(`[ActivityReminderCron] Failed for athlete ${athleteId}:`, err);
        }
      }
    } catch (err) {
      logger.error('[ActivityReminderCron] Fatal error:', err);
    }
  });

  logger.info('[ActivityReminderCron] Activity reminder cron started (runs every 5 minutes)');
}
