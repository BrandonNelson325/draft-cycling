import { useState, useEffect } from 'react';
import { dailyAnalysisService } from '../services/dailyAnalysisService';
import type { DailyAnalysis } from '../services/dailyAnalysisService';
import { useAuthStore } from '../stores/useAuthStore';

export function useDailyAnalysis() {
  const [shouldShow, setShouldShow] = useState(false);
  const [analysis, setAnalysis] = useState<DailyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    checkAndLoadAnalysis();
  }, [user]);

  const hasViewedTodayLocally = () => {
    const lastViewed = localStorage.getItem('daily_analysis_last_viewed');
    if (!lastViewed) return false;

    const lastViewedDate = new Date(lastViewed);
    const today = new Date();

    return (
      lastViewedDate.getFullYear() === today.getFullYear() &&
      lastViewedDate.getMonth() === today.getMonth() &&
      lastViewedDate.getDate() === today.getDate()
    );
  };

  const checkAndLoadAnalysis = async () => {
    try {
      setLoading(true);

      // Quick local check first to prevent multiple shows
      if (hasViewedTodayLocally()) {
        setShouldShow(false);
        setLoading(false);
        return;
      }

      // Check if user should see analysis
      const shouldShowAnalysis = await dailyAnalysisService.shouldShowAnalysis();

      if (shouldShowAnalysis) {
        // Load the analysis
        const todaysAnalysis = await dailyAnalysisService.getTodaysAnalysis();
        setAnalysis(todaysAnalysis);
        setShouldShow(true);
      }
    } catch (error) {
      console.error('Error loading daily analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissAnalysis = async () => {
    try {
      // Mark in localStorage immediately to prevent re-showing
      localStorage.setItem('daily_analysis_last_viewed', new Date().toISOString());
      setShouldShow(false);

      // Then update backend
      await dailyAnalysisService.markAsViewed();
    } catch (error) {
      console.error('Error marking analysis as viewed:', error);
      // Already dismissed locally, so user won't see it again today
    }
  };

  const refreshAnalysis = async () => {
    try {
      setLoading(true);
      const todaysAnalysis = await dailyAnalysisService.getTodaysAnalysis();
      setAnalysis(todaysAnalysis);
    } catch (error) {
      console.error('Error refreshing analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    shouldShow,
    analysis,
    loading,
    dismissAnalysis,
    refreshAnalysis,
  };
}
