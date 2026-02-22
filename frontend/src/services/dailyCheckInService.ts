import { api } from './api';

export interface DailyReadiness {
  date: string;
  hasCheckedInToday: boolean;
  todaysWorkout: {
    id: string;
    name: string;
    workout_type: string;
    duration_minutes: number;
    tss: number;
    description?: string;
  } | null;
  recentActivity: {
    last7DaysTSS: number;
    last7DaysRides: number;
    yesterdayWorkout: {
      name: string;
      tss: number;
      duration_minutes: number;
      average_watts?: number;
    } | null;
    lastRideDate: string | null;
    lastRideTSS: number | null;
  };
  readinessScore: number;
  recommendation: 'rest' | 'light' | 'proceed' | 'push';
  reasoning: string;
}

export interface DailyCheckInData {
  sleepQuality: 'poor' | 'good' | 'great';
  feeling: 'tired' | 'normal' | 'energized';
  notes?: string;
}

export const dailyCheckInService = {
  async getDailyReadiness(): Promise<DailyReadiness> {
    const { data, error } = await api.get<DailyReadiness>(
      '/api/daily-check-in/readiness',
      true
    );

    if (error || !data) {
      throw new Error(error?.error || 'Failed to get daily readiness');
    }

    return data;
  },

  async saveDailyCheckIn(checkInData: DailyCheckInData): Promise<DailyReadiness> {
    const { data, error } = await api.post<{ readiness: DailyReadiness }>(
      '/api/daily-check-in/check-in',
      checkInData,
      true
    );

    if (error || !data) {
      throw new Error(error?.error || 'Failed to save check-in');
    }

    return data.readiness;
  },

  async getTodayMetrics(): Promise<any> {
    const { data, error } = await api.get<{ metrics: any }>(
      '/api/daily-check-in/today',
      true
    );

    if (error) {
      return null;
    }

    return data?.metrics;
  },
};
