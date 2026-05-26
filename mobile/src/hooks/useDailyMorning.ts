import { useState, useEffect } from 'react';
import { AppState } from 'react-native';
import { dailyAnalysisService, type DailyAnalysis } from '../services/dailyAnalysisService';
import { dailyCheckInService, type DailyReadiness } from '../services/dailyCheckInService';
import { appleHealthService } from '../services/appleHealthService';
import { useAuthStore } from '../stores/useAuthStore';
import { appStorage } from '../utils/storage';

const LAST_SHOWN_KEY = 'daily_morning_last_shown';

export function useDailyMorning() {
  const [shouldShow, setShouldShow] = useState(false);
  const [analysis, setAnalysis] = useState<DailyAnalysis | null>(null);
  const [readiness, setReadiness] = useState<DailyReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    checkAndLoad();
    // Re-check when app returns to the foreground — catches the case where the
    // user backgrounds the app overnight and reopens it the next day, which
    // wouldn't trigger a user-prop change to re-run this effect.
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

  const checkAndLoad = async (skipLocalCheck = false) => {
    try {
      setLoading(true);

      if (!skipLocalCheck && await hasShownTodayLocally()) {
        setLoading(false);
        return;
      }

      // Push today's HealthKit data to the backend before fetching readiness so
      // the response includes wellness data. Best-effort: failures are silent
      // and the modal falls back to manual pickers.
      let waitForWellnessData = false;
      if (appleHealthService.isAvailable()) {
        try {
          const status = await appleHealthService.getStatus();
          if (status.enabled) {
            await appleHealthService.syncToday();
          }
          // Only suppress the auto-pop when the athlete explicitly opted
          // to USE Apple Health as the wellness source — not just for
          // having the connection on for other reasons.
          waitForWellnessData = status.enabled && status.use_for_wellness;
        } catch {
          // ignore
        }
      }

      const readinessData = await dailyCheckInService.getDailyReadiness();

      if (!readinessData.hasCheckedInToday) {
        setReadiness(readinessData);

        try {
          const todaysAnalysis = await dailyAnalysisService.getTodaysAnalysis();
          setAnalysis(todaysAnalysis);
        } catch {
          // Analysis is optional
        }

        // When Apple Health is the chosen wellness source AND data hasn't
        // landed yet today, don't interrupt the user. The backend's
        // pushAppleHealthWellness endpoint fires a push when data arrives,
        // which routes through usePushNotifications → forceShow() to open
        // the modal at that point.
        if (waitForWellnessData && !readinessData.wellness && !skipLocalCheck) {
          setShouldShow(false);
        } else {
          setShouldShow(true);
        }
      } else {
        await appStorage.setItem(LAST_SHOWN_KEY, new Date().toISOString());
      }
    } catch (error) {
      console.error('Error loading daily morning data:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismiss = async () => {
    await appStorage.setItem(LAST_SHOWN_KEY, new Date().toISOString());
    setShouldShow(false);
  };

  const forceShow = () => {
    checkAndLoad(true);
  };

  return { shouldShow, analysis, readiness, loading, dismiss, forceShow };
}
