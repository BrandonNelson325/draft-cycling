import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/useAuthStore';

// Configure how notifications are presented when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

/**
 * Call once from App.tsx after the user is authenticated.
 * Requests permission, obtains an Expo push token, and registers it with the backend.
 */
export function usePushNotifications() {
  const { user } = useAuthStore();
  const notificationListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription | undefined>(undefined);

  useEffect(() => {
    if (!user) return;

    registerForPushNotificationsAsync().then(async (token) => {
      if (!token) return;

      try {
        await apiClient.put('/api/push/token', { token, enabled: true });
      } catch (err) {
        // Non-fatal — notifications simply won't be sent until next app open
        console.warn('[Push] Failed to register push token:', err);
      }
    });

    // Listen for notifications received while the app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((_notification) => {
      // Notification received in foreground — handler above shows the alert automatically
    });

    // Listen for the user tapping a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((_response) => {
      // Navigation based on notification data can be added here in the future
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user?.id]);
}
