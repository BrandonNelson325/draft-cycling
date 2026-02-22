import { api } from './api';
import type { Workout } from './workoutService';

export interface CalendarEntry {
  id: string;
  athlete_id: string;
  workout_id: string;
  scheduled_date: string; // YYYY-MM-DD
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

export interface ScheduleWorkoutDTO {
  workout_id: string;
  scheduled_date: string; // YYYY-MM-DD
  ai_rationale?: string;
}

export interface CompleteWorkoutDTO {
  notes?: string;
  strava_activity_id?: number;
}

export const calendarService = {
  /**
   * Schedule a workout to a specific date
   */
  async scheduleWorkout(workoutId: string, date: Date, aiRationale?: string): Promise<CalendarEntry> {
    const dateStr = date.toISOString().split('T')[0];
    const data: ScheduleWorkoutDTO = {
      workout_id: workoutId,
      scheduled_date: dateStr,
      ai_rationale: aiRationale,
    };

    const { data: entry, error } = await api.post<CalendarEntry>('/api/calendar', data, true);

    if (error) {
      throw new Error(error.error || 'Failed to schedule workout');
    }

    return entry!;
  },

  /**
   * Get calendar data for a date range (scheduled workouts + Strava activities)
   */
  async getCalendar(startDate: Date, endDate: Date): Promise<CalendarData> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const { data, error } = await api.get<CalendarData>(
      `/api/calendar?start=${startStr}&end=${endStr}`,
      true
    );

    if (error) {
      throw new Error(error.error || 'Failed to fetch calendar');
    }

    return data || { scheduledWorkouts: [], stravaActivities: [] };
  },

  /**
   * Move a workout to a different date
   */
  async moveWorkout(entryId: string, newDate: Date): Promise<CalendarEntry> {
    const dateStr = newDate.toISOString().split('T')[0];

    const { data, error } = await api.put<CalendarEntry>(
      `/api/calendar/${entryId}`,
      { scheduled_date: dateStr },
      true
    );

    if (error) {
      throw new Error(error.error || 'Failed to move workout');
    }

    return data!;
  },

  /**
   * Update calendar entry
   */
  async updateEntry(
    entryId: string,
    updates: { scheduled_date?: string; notes?: string }
  ): Promise<CalendarEntry> {
    const { data, error } = await api.put<CalendarEntry>(`/api/calendar/${entryId}`, updates, true);

    if (error) {
      throw new Error(error.error || 'Failed to update calendar entry');
    }

    return data!;
  },

  /**
   * Delete a calendar entry
   */
  async deleteEntry(entryId: string): Promise<void> {
    const { error } = await api.delete(`/api/calendar/${entryId}`, true);

    if (error) {
      throw new Error(error.error || 'Failed to delete calendar entry');
    }
  },

  /**
   * Mark workout as completed
   */
  async completeWorkout(
    entryId: string,
    notes?: string,
    stravaActivityId?: number
  ): Promise<CalendarEntry> {
    const data: CompleteWorkoutDTO = {
      notes,
      strava_activity_id: stravaActivityId,
    };

    const { data: entry, error } = await api.post<CalendarEntry>(
      `/api/calendar/${entryId}/complete`,
      data,
      true
    );

    if (error) {
      throw new Error(error.error || 'Failed to complete workout');
    }

    return entry!;
  },

  /**
   * Bulk schedule workouts (for training plans)
   */
  async bulkSchedule(
    entries: { workout_id: string; scheduled_date: string; ai_rationale?: string }[]
  ): Promise<CalendarEntry[]> {
    const { data, error } = await api.post<{ entries: CalendarEntry[] }>(
      '/api/calendar/bulk',
      { entries },
      true
    );

    if (error) {
      throw new Error(error.error || 'Failed to bulk schedule workouts');
    }

    return data?.entries || [];
  },

  /**
   * Clear all calendar entries
   */
  async clearCalendar(): Promise<{ message: string; deletedCount: number }> {
    const { data, error } = await api.delete<{ message: string; deletedCount: number }>(
      '/api/calendar/clear',
      true
    );

    if (error) {
      throw new Error(error.error || 'Failed to clear calendar');
    }

    return data!;
  },
};
