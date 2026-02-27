import { useState, useEffect } from 'react';
import { dailyAnalysisService, type DailyAnalysis } from '../services/dailyAnalysisService';
import { dailyCheckInService, type DailyReadiness } from '../services/dailyCheckInService';
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

  const checkAndLoad = async () => {
    try {
      setLoading(true);

      if (await hasShownTodayLocally()) {
        setLoading(false);
        return;
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

        setShouldShow(true);
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

  return { shouldShow, analysis, readiness, loading, dismiss };
}
