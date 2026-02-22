import { useState, useEffect } from 'react';
import { dailyCheckInService, type DailyReadiness } from '../services/dailyCheckInService';
import { useAuthStore } from '../stores/useAuthStore';

export function useDailyCheckIn() {
  const [shouldShow, setShouldShow] = useState(false);
  const [readiness, setReadiness] = useState<DailyReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    checkAndLoadReadiness();
  }, [user]);

  const hasShownTodayLocally = () => {
    const lastShown = localStorage.getItem('daily_checkin_last_shown');
    if (!lastShown) return false;

    const lastShownDate = new Date(lastShown);
    const today = new Date();

    return (
      lastShownDate.getFullYear() === today.getFullYear() &&
      lastShownDate.getMonth() === today.getMonth() &&
      lastShownDate.getDate() === today.getDate()
    );
  };

  const checkAndLoadReadiness = async () => {
    try {
      setLoading(true);

      // Quick local check first to prevent multiple shows
      if (hasShownTodayLocally()) {
        setShouldShow(false);
        setLoading(false);
        return;
      }

      // Load daily readiness data
      const readinessData = await dailyCheckInService.getDailyReadiness();

      // Show modal if user hasn't checked in today
      if (!readinessData.hasCheckedInToday) {
        setReadiness(readinessData);
        setShouldShow(true);
      } else {
        // Already checked in, mark as shown locally
        localStorage.setItem('daily_checkin_last_shown', new Date().toISOString());
      }
    } catch (error) {
      console.error('Error loading daily readiness:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissCheckIn = () => {
    // Mark as shown locally to prevent re-showing today
    localStorage.setItem('daily_checkin_last_shown', new Date().toISOString());
    setShouldShow(false);
  };

  return {
    shouldShow,
    readiness,
    loading,
    dismissCheckIn,
  };
}
