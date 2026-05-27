import { useState, useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { dailyAnalysisService, type DailyAnalysis } from '../services/dailyAnalysisService';
import { dailyCheckInService, type DailyReadiness } from '../services/dailyCheckInService';
import { appleHealthService } from '../services/appleHealthService';
import { useAuthStore } from '../stores/useAuthStore';
import { appStorage } from '../utils/storage';

const LAST_SHOWN_KEY = 'daily_morning_last_shown';
const SYNC_RETRY_NOTIF_ID = 'apple-health-sync-retry';
const MAX_AUTO_RETRIES = 2;

export function useDailyMorning() {
  const [shouldShow, setShouldShow] = useState(false);
  const [analysis, setAnalysis] = useState<DailyAnalysis | null>(null);
  const [readiness, setReadiness] = useState<DailyReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  // True when the user has opted in to use Apple Health for wellness, today's
  // sleep data hasn't arrived yet, and they haven't manually chosen to skip.
  // Modal renders the "Waiting for sync" screen in this state.
  const [awaitingSleepData, setAwaitingSleepData] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  // Sticky override: once the user taps "Skip — answer manually", we stop
  // showing the waiting screen for the rest of this app session.
  const [manualOverride, setManualOverride] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    checkAndLoad();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndLoad();
    });
    return () => sub.remove();
  }, [user]);

  const hasShownTodayLocally = async (): Promise<boolean> => {
    const lastShown = await appStorage.getItem(LAST_SHOWN_KEY);
    if (!lastShown) return false;
    const lastShownDate = new Date(lastShown);
    const today = new Date();
    return (
      lastShownDate.getFullYear() === today.getFullYear() &&
      lastShownDate.getMonth() === today.getMonth() &&
      lastShownDate.getDate() === today.getDate()
    );
  };

  /**
   * Cancel any pending "retry sync" local notification. Called whenever we
   * land in a state that supersedes it (sleep arrived, user skipped manually,
   * or check-in completed).
   */
  const cancelRetryNotification = async () => {
    try {
      await Notifications.cancelScheduledNotificationAsync(SYNC_RETRY_NOTIF_ID);
    } catch {
      // ignore — not all platforms allow cancelling unknown IDs
    }
  };

  const scheduleRetryNotification = async () => {
    try {
      await cancelRetryNotification();
      await Notifications.scheduleNotificationAsync({
        identifier: SYNC_RETRY_NOTIF_ID,
        content: {
          title: 'Try syncing again',
          body: "Open Garmin Connect (or your device's app), tap Sync, then come back to finish your check-in.",
          data: { screen: 'Home', type: 'sync_retry' },
        },
        trigger: { seconds: 15 * 60, channelId: 'default' } as any,
      });
    } catch (err) {
      console.warn('[useDailyMorning] Failed to schedule retry notification:', err);
    }
  };

  const checkAndLoad = async (skipLocalCheck = false) => {
    try {
      setLoading(true);

      if (!skipLocalCheck && await hasShownTodayLocally()) {
        setLoading(false);
        return;
      }

      // Sync HealthKit before fetching readiness so the response reflects
      // whatever the user's device has surfaced today.
      let useAppleHealthForWellness = false;
      if (appleHealthService.isAvailable()) {
        try {
          const status = await appleHealthService.getStatus();
          if (status.enabled) {
            await appleHealthService.syncToday();
          }
          useAppleHealthForWellness = status.enabled && status.use_for_wellness;
        } catch {
          // ignore — fall through to manual flow
        }
      }

      const readinessData = await dailyCheckInService.getDailyReadiness();

      if (readinessData.hasCheckedInToday) {
        await appStorage.setItem(LAST_SHOWN_KEY, new Date().toISOString());
        await cancelRetryNotification();
        setAwaitingSleepData(false);
        setLoading(false);
        return;
      }

      setReadiness(readinessData);
      try {
        const todaysAnalysis = await dailyAnalysisService.getTodaysAnalysis();
        setAnalysis(todaysAnalysis);
      } catch {
        // Analysis is optional
      }

      // Decide whether to show the modal AT ALL, and in what state.
      // - manualOverride: user already pressed "Skip — answer manually"
      //   → show modal in subjective mode (handled by the modal reading
      //   readiness.wellness and showing the sleep picker).
      // - useAppleHealthForWellness AND no objective sleep in wellness:
      //   show the modal in WAITING state.
      // - otherwise: show the modal normally.
      const hasObjectiveSleep = readinessData.wellness?.sleepSeconds != null;
      const shouldWait = useAppleHealthForWellness && !hasObjectiveSleep && !manualOverride;

      if (shouldWait) {
        setAwaitingSleepData(true);
        setShouldShow(true);
      } else {
        setAwaitingSleepData(false);
        setShouldShow(true);
        await cancelRetryNotification();
      }
    } catch (error) {
      console.error('Error loading daily morning data:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * User pressed "Try Again" on the waiting screen. Re-sync HealthKit and
   * re-evaluate. After MAX_AUTO_RETRIES with no luck, schedule a local
   * notification 15 min from now so they get reminded to try later.
   */
  const retrySync = async () => {
    setLoading(true);
    try {
      if (appleHealthService.isAvailable()) {
        await appleHealthService.syncToday();
      }
      const readinessData = await dailyCheckInService.getDailyReadiness();
      setReadiness(readinessData);

      const hasObjectiveSleep = readinessData.wellness?.sleepSeconds != null;
      if (hasObjectiveSleep) {
        setAwaitingSleepData(false);
        setRetryCount(0);
        await cancelRetryNotification();
      } else {
        const nextCount = retryCount + 1;
        setRetryCount(nextCount);
        if (nextCount <= MAX_AUTO_RETRIES) {
          await scheduleRetryNotification();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * User pressed "Skip — answer manually". Drop the wait state for the rest
   * of this app session and fall through to the subjective questionnaire.
   */
  const skipToManual = async () => {
    setManualOverride(true);
    setAwaitingSleepData(false);
    await cancelRetryNotification();
  };

  const dismiss = async () => {
    await appStorage.setItem(LAST_SHOWN_KEY, new Date().toISOString());
    await cancelRetryNotification();
    setShouldShow(false);
    setAwaitingSleepData(false);
  };

  const forceShow = () => {
    checkAndLoad(true);
  };

  return {
    shouldShow,
    analysis,
    readiness,
    loading,
    awaitingSleepData,
    retryCount,
    maxRetries: MAX_AUTO_RETRIES,
    dismiss,
    forceShow,
    retrySync,
    skipToManual,
  };
}
