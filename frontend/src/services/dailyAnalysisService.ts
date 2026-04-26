import { api } from './api';

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
  } | null;
}

export const dailyAnalysisService = {
  async getTodaysAnalysis(): Promise<DailyAnalysis> {
    const { data, error } = await api.get<DailyAnalysis>('/api/daily-analysis/today', true);

    if (error) {
      throw new Error(error.error || 'Failed to get daily analysis');
    }

    return data!;
  },

  async shouldShowAnalysis(): Promise<boolean> {
    const { data, error } = await api.get<{ shouldShow: boolean; hasViewedToday: boolean }>(
      '/api/daily-analysis/should-show',
      true
    );

    if (error) {
      console.error('Error checking if should show analysis:', error);
      return false;
    }

    return data?.shouldShow || false;
  },

  async markAsViewed(): Promise<void> {
    const { error } = await api.post('/api/daily-analysis/mark-viewed', {}, true);

    if (error) {
      console.error('Error marking analysis as viewed:', error);
    }
  },

  async getTodaySuggestion(): Promise<TodaySuggestion> {
    const { data, error } = await api.get<TodaySuggestion>('/api/daily-analysis/suggestion', true);

    if (error) {
      throw new Error(error.error || 'Failed to get today\'s suggestion');
    }

    return data!;
  },

  async acceptAdjustment(kind: 'rest' | 'easier', reason?: string): Promise<void> {
    const { error } = await api.post('/api/daily-analysis/adjustment/accept', { kind, reason }, true);
    if (error) {
      throw new Error(error.error || 'Failed to accept adjustment');
    }
  },

  async dismissAdjustment(): Promise<void> {
    const { error } = await api.post('/api/daily-analysis/adjustment/dismiss', {}, true);
    if (error) {
      throw new Error(error.error || 'Failed to dismiss adjustment');
    }
  },
};
