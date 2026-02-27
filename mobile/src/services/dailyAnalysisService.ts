import apiClient from '../api/client';

export interface DailyAnalysis {
  date: string;
  summary: string;
  yesterdayRides: {
    name: string;
    duration: number;
    tss: number;
    avgPower: number;
  }[];
  yesterdayTotalTSS: number;
  currentTSB: number;
  currentCTL: number;
  currentATL: number;
  status: 'well-recovered' | 'slightly-tired' | 'fatigued' | 'fresh';
  recommendation: string;
  todaysWorkout: {
    name: string;
    type: string;
    duration: number;
    tss: number;
  } | null;
  suggestedAction: 'proceed-as-planned' | 'make-easier' | 'add-rest' | 'can-do-more';
}

export const dailyAnalysisService = {
  async getTodaysAnalysis(): Promise<DailyAnalysis> {
    const { data } = await apiClient.get<DailyAnalysis>('/api/daily-analysis/today');
    return data;
  },

  async shouldShowAnalysis(): Promise<boolean> {
    try {
      const { data } = await apiClient.get<{ shouldShow: boolean; hasViewedToday: boolean }>(
        '/api/daily-analysis/should-show'
      );
      return data?.shouldShow || false;
    } catch {
      return false;
    }
  },

  async markAsViewed(): Promise<void> {
    try {
      await apiClient.post('/api/daily-analysis/mark-viewed', {});
    } catch {
      // ignore
    }
  },
};
