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

export interface AdjustmentSuggestion {
  kind: 'rest' | 'easier' | 'swap' | 'none';
  headline: string;
  reason: string;
  alternativeWorkout?: {
    workoutId?: string;
    name: string;
    type: string;
    duration: number;
    tss: number;
  };
  generatedAt: string;
}

export interface TodaySuggestion {
  hasRiddenToday: boolean;
  suggestion: {
    summary: string;
    recommendation: string;
    suggestedAction: 'proceed-as-planned' | 'make-easier' | 'add-rest' | 'can-do-more' | 'suggested-workout';
    todaysWorkout: { workoutId?: string; name: string; type: string; duration: number; tss: number } | null;
    suggestedWorkout: { workoutId?: string; name: string; type: string; duration: number; description: string } | null;
    status: 'well-recovered' | 'slightly-tired' | 'fatigued' | 'fresh';
    currentTSB: number;
    tomorrowsWorkout: { workoutId?: string; name: string; type: string; duration: number; tss: number } | null;
    todaysRides: { name: string; duration: number; tss: number }[];
    adjustment: AdjustmentSuggestion | null;
    isRestDay: boolean;
  } | null;
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

  async getTodaySuggestion(): Promise<TodaySuggestion> {
    const { data } = await apiClient.get<TodaySuggestion>('/api/daily-analysis/suggestion');
    return data;
  },

  async acceptAdjustment(kind: 'rest' | 'easier', reason?: string): Promise<void> {
    await apiClient.post('/api/daily-analysis/adjustment/accept', { kind, reason });
  },

  async dismissAdjustment(): Promise<void> {
    await apiClient.post('/api/daily-analysis/adjustment/dismiss', {});
  },
};
