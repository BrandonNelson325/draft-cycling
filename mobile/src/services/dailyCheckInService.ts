import apiClient from '../api/client';

export interface WellnessData {
  source: 'whoop' | 'intervals_icu' | 'apple_health' | 'manual';
  hrv: number | null;
  rhr: number | null;
  sleepSeconds: number | null;
  sleepScore: number | null;
  readinessScore: number | null;
  syncedAt: string | null;
  // WHOOP extras
  recoveryCalibrating?: boolean | null;
  sleepNeedSeconds?: number | null;
  sleepDebtSeconds?: number | null;
  respiratoryRate?: number | null;
  dayStrain?: number | null;
  otherActivities?: { sport: string; minutes: number; strain: number | null }[] | null;
}

export interface WhoopReadinessStatus {
  connected: boolean;
  /** Connected, but today's recovery isn't scored yet (Whoop scores after you wake). */
  awaitingToday: boolean;
  latest: { date: string; readinessScore: number; hrv: number | null; rhr: number | null; sleepSeconds: number | null; sleepNeedSeconds: number | null; dayStrain: number | null } | null;
}

export interface DailyReadiness {
  date: string;
  hasCheckedInToday: boolean;
  whoop?: WhoopReadinessStatus;
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
  wellness: WellnessData | null;
}

export interface DailyCheckInData {
  sleepQuality?: 'terrible' | 'poor' | 'okay' | 'good' | 'great';
  /** Optional on WHOOP days — Whoop's recovery replaces the subjective questions. */
  feeling?: 'exhausted' | 'tired' | 'normal' | 'good' | 'energized';
  notes?: string;
  /** WHOOP days: "anything off?" — things the strap can't see. */
  offFlags?: ('sore' | 'sick' | 'stressed' | 'injured')[];
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
