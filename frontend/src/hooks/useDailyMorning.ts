import { useState, useEffect } from 'react';
import { dailyAnalysisService } from '../services/dailyAnalysisService';
import type { DailyAnalysis } from '../services/dailyAnalysisService';
import { dailyCheckInService, type DailyReadiness } from '../services/dailyCheckInService';
import { useAuthStore } from '../stores/useAuthStore';

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

  const hasShownTodayLocally = () => {
    const lastShown = localStorage.getItem('daily_morning_last_shown');
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

      if (hasShownTodayLocally()) {
        setLoading(false);
        return;
      }

      const readinessData = await dailyCheckInService.getDailyReadiness();

      // Only show modal if user hasn't checked in today
      if (!readinessData.hasCheckedInToday) {
        setReadiness(readinessData);

        // Pre-load analysis so step 2 is ready after they answer
        try {
          const todaysAnalysis = await dailyAnalysisService.getTodaysAnalysis();
          setAnalysis(todaysAnalysis);
        } catch {
          // Analysis is optional — modal still works without it
        }

        setShouldShow(true);
      } else {
        // Already checked in — mark locally so we don't hit the API again today
        localStorage.setItem('daily_morning_last_shown', new Date().toISOString());
      }
    } catch (error) {
      console.error('Error loading daily morning data:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem('daily_morning_last_shown', new Date().toISOString());
    setShouldShow(false);
  };

  return {
    shouldShow,
    analysis,
    readiness,
    loading,
    dismiss,
  };
}
