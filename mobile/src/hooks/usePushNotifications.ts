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
// Track push token registration per app session to avoid redundant API calls
let pushTokenRegistered = false;

export function usePushNotifications(onRideNotificationTap?: () => void, onMorningCheckInTap?: () => void) {
  const { user } = useAuthStore();
  const notificationListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const callbacksRef = useRef({ onRideNotificationTap, onMorningCheckInTap });
  callbacksRef.current = { onRideNotificationTap, onMorningCheckInTap };

  // Register push token once per session (separate from notification handling)
  useEffect(() => {
    if (!user || pushTokenRegistered) return;

    registerForPushNotificationsAsync().then(async (token) => {
      if (!token) return;
      try {
        await apiClient.put('/api/push/token', { token, enabled: true });
        pushTokenRegistered = true;
      } catch (err) {
        console.warn('[Push] Failed to register push token:', err);
      }
    });
  }, [user?.id]);

  // Notification listeners (separate effect — no API calls here)
  useEffect(() => {
    if (!user) return;

    const handleNotificationScreen = (screen: string | undefined) => {
      // Delay slightly to ensure auth state is settled after app wake
      setTimeout(() => {
        if (screen === 'Activities' && callbacksRef.current.onRideNotificationTap) {
          callbacksRef.current.onRideNotificationTap();
        } else if (screen === 'Home' && callbacksRef.current.onMorningCheckInTap) {
          callbacksRef.current.onMorningCheckInTap();
        }
      }, 500);
    };

    // Handle cold-start: check if app was launched by tapping a notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      handleNotificationScreen(response.notification.request.content.data?.screen as string | undefined);
    });

    // Listen for notifications received while the app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      // Don't auto-trigger on foreground receive — only on tap
    });

    // Listen for the user tapping a notification (while app is running/backgrounded)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationScreen(response.notification.request.content.data?.screen as string | undefined);
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
