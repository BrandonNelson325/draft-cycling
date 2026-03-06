import { api } from './api';

export interface PlannedWorkoutInfo {
  calendarEntryId: string;
  workoutId: string;
  workoutName: string;
  workoutType: string;
  plannedTSS: number | null;
  plannedDuration: number;
  description?: string;
}

export interface UnacknowledgedActivity {
  id: string;
  name: string;
  start_date: string;
  strava_activity_id: number;
  distance_meters: number | null;
  moving_time_seconds: number | null;
  average_watts: number | null;
  tss: number | null;
  average_heartrate: number | null;
  calories: number | null;
  plannedWorkout: PlannedWorkoutInfo | null;
  matchConfidence: 'high' | 'partial' | 'low' | null;
}

export interface ActivityFeedback {
  perceived_effort?: number;
  notes?: string;
  was_planned_workout?: boolean;
  calendar_entry_id?: string;
}

export const activityFeedbackService = {
  async getUnacknowledged(): Promise<UnacknowledgedActivity[]> {
    const { data, error } = await api.get<{ activities: UnacknowledgedActivity[] }>(
      '/api/activities/unacknowledged',
      true
    );

    if (error || !data) {
      throw new Error(error?.error || 'Failed to get unacknowledged activities');
    }

    return data.activities;
  },

  async acknowledge(activityId: string, feedback: ActivityFeedback): Promise<void> {
    const { error } = await api.post(
      `/api/activities/${activityId}/acknowledge`,
      feedback,
      true
    );

    if (error) {
      throw new Error(error.error || 'Failed to acknowledge activity');
    }
  },
};
