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
 * Send a "new ride synced" notification to an athlete.
 * Respects quiet hours — skips if currently in the quiet window.
 */
export async function sendRideCompletedNotification(athleteId: string): Promise<void> {
  const { data: athlete, error } = await supabaseAdmin
    .from('athletes')
    .select('push_token, push_notifications_enabled')
    .eq('id', athleteId)
    .single();

  if (error || !athlete) {
    logger.error(`[Push] Could not fetch athlete ${athleteId}:`, error);
    return;
  }

  if (!athlete.push_notifications_enabled || !athlete.push_token) return;

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
  const { data: athlete, error } = await supabaseAdmin
    .from('athletes')
    .select('push_token, push_notifications_enabled')
    .eq('id', athleteId)
    .single();

  if (error || !athlete) {
    logger.error(`[Push] Could not fetch athlete ${athleteId}:`, error);
    return;
  }

  if (!athlete.push_notifications_enabled || !athlete.push_token) return;

  await sendPushNotification(
    athlete.push_token,
    'Good morning!',
    'Time for your daily check-in \uD83C\uDF05',
    { screen: 'Home' }
  );

  logger.info(`[Push] Morning check-in notification sent to athlete ${athleteId}`);
}

// Garmin stub — call this when Garmin sync is implemented
// export async function sendGarminSyncNotification(athleteId: string): Promise<void> {
//   await sendMorningCheckInNotification(athleteId); // reuse pattern above
// }
