import { api } from './api';

export interface UnacknowledgedActivity {
  id: string;
  name: string;
  start_date: string;
  distance_meters: number | null;
  moving_time_seconds: number | null;
  average_watts: number | null;
  tss: number | null;
  average_heartrate: number | null;
}

export interface ActivityFeedback {
  perceived_effort?: number;
  notes?: string;
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
