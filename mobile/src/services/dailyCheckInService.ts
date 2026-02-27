import apiClient from '../api/client';

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

function getLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export const dailyCheckInService = {
  async getDailyReadiness(): Promise<DailyReadiness> {
    const localDate = getLocalDate();
    const { data } = await apiClient.get<DailyReadiness>(
      `/api/daily-check-in/readiness?localDate=${localDate}`
    );
    return data;
  },

  async saveDailyCheckIn(checkInData: DailyCheckInData): Promise<DailyReadiness> {
    const { data } = await apiClient.post<{ readiness: DailyReadiness }>(
      '/api/daily-check-in/check-in',
      { ...checkInData, localDate: getLocalDate() }
    );
    return data.readiness;
  },

  async getTodayMetrics(): Promise<any> {
    try {
      const { data } = await apiClient.get<{ metrics: any }>('/api/daily-check-in/today');
      return data?.metrics;
    } catch {
      return null;
    }
  },
};
