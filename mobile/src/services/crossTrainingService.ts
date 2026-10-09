import apiClient from '../api/client';

export interface CrossTrainingActivity {
  id: number;
  name: string | null;
  sport_type: string;
  category: string;
  label: string;
  effect: string;
  start_date: string;
  duration_min: number | null;
  distance_meters: number | null;
  avg_hr: number | null;
  est_load: number | null;
  fatigue_load: number | null;
  load_method: 'hr' | 'duration' | null;
}

export const crossTrainingService = {
  async list(days = 14): Promise<{ activities: CrossTrainingActivity[]; last7_fatigue_load: number }> {
    const { data } = await apiClient.get(`/api/strava/cross-training?days=${days}`);
    return data;
  },
};
