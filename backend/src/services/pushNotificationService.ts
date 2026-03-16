import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';

/**
 * Send a push notification via the Expo Push Notification API.
 */
export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: object
): Promise<void> {
  const message = {
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
  };

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`[Push] Failed to send notification: ${response.status} ${text}`);
    throw new Error(`Push notification failed: ${response.status}`);
  }

  const result = await response.json() as { data?: { status?: string } };
  if (result?.data?.status === 'error') {
    logger.error('[Push] Expo push error:', result.data);
  }
}

/**
 * Fetch athlete push token and enabled flag. Returns null if not eligible.
 */
async function getAthleteForPush(athleteId: string) {
  const { data: athlete, error } = await supabaseAdmin
    .from('athletes')
    .select('push_token, push_notifications_enabled')
    .eq('id', athleteId)
    .single();

  if (error || !athlete) {
    logger.error(`[Push] Could not fetch athlete ${athleteId}:`, error);
    return null;
  }

  if (!athlete.push_notifications_enabled || !athlete.push_token) return null;
  return athlete;
}

/**
 * Send a "new ride synced" notification to an athlete.
 * Only sends if no notification was already sent for these new activities.
 * Marks activities with notification_sent_at timestamp.
 */
export async function sendRideCompletedNotification(
  athleteId: string,
  activityIds?: string[]
): Promise<void> {
  const athlete = await getAthleteForPush(athleteId);
  if (!athlete) return;

  // If specific activity IDs provided, mark them as notified
  if (activityIds && activityIds.length > 0) {
    // Check if any of these activities already have a notification sent
    const { data: alreadyNotified } = await supabaseAdmin
      .from('strava_activities')
      .select('id')
      .in('id', activityIds)
      .not('notification_sent_at', 'is', null);

    if (alreadyNotified && alreadyNotified.length === activityIds.length) {
      // All activities already notified — skip
      return;
    }

    await supabaseAdmin
      .from('strava_activities')
      .update({ notification_sent_at: new Date().toISOString() })
      .in('id', activityIds)
      .is('notification_sent_at', null);
  }

  await sendPushNotification(
    athlete.push_token,
    'New ride synced!',
    'How did it feel? Tap to log your RPE.',
    { screen: 'Activities' }
  );

  logger.info(`[Push] Ride notification sent to athlete ${athleteId}`);
}

/**
 * Send a morning check-in notification to an athlete.
 */
export async function sendMorningCheckInNotification(athleteId: string): Promise<void> {
  const athlete = await getAthleteForPush(athleteId);
  if (!athlete) return;

  await sendPushNotification(
    athlete.push_token,
    'Good morning!',
    'Time for your daily check-in \uD83C\uDF05',
    { screen: 'Home' }
  );

  logger.info(`[Push] Morning check-in notification sent to athlete ${athleteId}`);
}

/**
 * Send a morning check-in reminder (4 hours after initial).
 */
export async function sendMorningCheckInReminder(athleteId: string): Promise<void> {
  const athlete = await getAthleteForPush(athleteId);
  if (!athlete) return;

  await sendPushNotification(
    athlete.push_token,
    'Don\'t forget!',
    'You haven\'t done your morning check-in yet. Quick tap to log how you\'re feeling.',
    { screen: 'Home' }
  );

  logger.info(`[Push] Morning check-in reminder sent to athlete ${athleteId}`);
}

/**
 * Send a reminder for unacknowledged activity feedback (4 hours after initial notification).
 */
export async function sendActivityFeedbackReminder(athleteId: string): Promise<void> {
  const athlete = await getAthleteForPush(athleteId);
  if (!athlete) return;

  await sendPushNotification(
    athlete.push_token,
    'Don\'t forget!',
    'You still have a ride to review. Tap to log how it felt.',
    { screen: 'Activities' }
  );

  logger.info(`[Push] Activity feedback reminder sent to athlete ${athleteId}`);
}
