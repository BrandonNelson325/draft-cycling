import apiClient from '../api/client';

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
    const { data } = await apiClient.get<{ activities: UnacknowledgedActivity[] }>(
      '/api/activities/unacknowledged'
    );
    return data?.activities || [];
  },

  async acknowledge(activityId: string, feedback: ActivityFeedback): Promise<void> {
    await apiClient.post(`/api/activities/${activityId}/acknowledge`, feedback);
  },
};
