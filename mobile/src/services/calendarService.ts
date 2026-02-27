import apiClient from '../api/client';
import type { Workout } from './workoutService';

export interface CalendarEntry {
  id: string;
  athlete_id: string;
  workout_id: string;
  scheduled_date: string;
  completed: boolean;
  completed_at?: string;
  notes?: string;
  ai_rationale?: string;
  strava_activity_id?: number;
  created_at: string;
  updated_at?: string;
  workouts?: Workout;
}

export interface StravaActivity {
  id: string;
  strava_id: number;
  athlete_id: string;
  name: string;
  start_date: string;
  distance_meters: number;
  moving_time_seconds: number;
  elapsed_time_seconds: number;
  total_elevation_gain: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  tss?: number;
  intensity_factor?: number;
  type: string;
}

export interface CalendarData {
  scheduledWorkouts: CalendarEntry[];
  stravaActivities: StravaActivity[];
}

export const calendarService = {
  async scheduleWorkout(
    workoutId: string,
    date: Date,
    aiRationale?: string
  ): Promise<CalendarEntry> {
    const dateStr = date.toISOString().split('T')[0];
    const { data } = await apiClient.post<CalendarEntry>('/api/calendar', {
      workout_id: workoutId,
      scheduled_date: dateStr,
      ai_rationale: aiRationale,
    });
    return data;
  },

  async getCalendar(startDate: Date, endDate: Date): Promise<CalendarData> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const { data } = await apiClient.get<CalendarData>(
      `/api/calendar?start=${startStr}&end=${endStr}`
    );
    return data || { scheduledWorkouts: [], stravaActivities: [] };
  },

  async moveWorkout(entryId: string, newDate: Date): Promise<CalendarEntry> {
    const dateStr = newDate.toISOString().split('T')[0];
    const { data } = await apiClient.put<CalendarEntry>(`/api/calendar/${entryId}`, {
      scheduled_date: dateStr,
    });
    return data;
  },

  async updateEntry(
    entryId: string,
    updates: { scheduled_date?: string; notes?: string }
  ): Promise<CalendarEntry> {
    const { data } = await apiClient.put<CalendarEntry>(`/api/calendar/${entryId}`, updates);
    return data;
  },

  async deleteEntry(entryId: string): Promise<void> {
    await apiClient.delete(`/api/calendar/${entryId}`);
  },

  async completeWorkout(
    entryId: string,
    notes?: string,
    stravaActivityId?: number
  ): Promise<CalendarEntry> {
    const { data } = await apiClient.post<CalendarEntry>(`/api/calendar/${entryId}/complete`, {
      notes,
      strava_activity_id: stravaActivityId,
    });
    return data;
  },

  async bulkSchedule(
    entries: { workout_id: string; scheduled_date: string; ai_rationale?: string }[]
  ): Promise<CalendarEntry[]> {
    const { data } = await apiClient.post<{ entries: CalendarEntry[] }>(
      '/api/calendar/bulk',
      { entries }
    );
    return data?.entries || [];
  },

  async clearCalendar(): Promise<{ message: string; deletedCount: number }> {
    const { data } = await apiClient.delete<{ message: string; deletedCount: number }>(
      '/api/calendar/clear'
    );
    return data;
  },
};
