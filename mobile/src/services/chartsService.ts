import apiClient from '../api/client';

export interface WeeklyData {
  week_start: string;
  total_distance_meters: number;
  total_tss: number;
  total_time_seconds: number;
  ride_count: number;
}

export interface FitnessData {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface PowerZoneData {
  zone: string;
  minutes: number;
  hours: string;
}

export const chartsService = {
  async getWeeklyData(weeks = 6): Promise<WeeklyData[]> {
    const { data } = await apiClient.get<WeeklyData[]>(`/api/charts/weekly?weeks=${weeks}`);
    return data || [];
  },

  async getFitnessTimeSeries(days = 42): Promise<FitnessData[]> {
    const { data } = await apiClient.get<FitnessData[]>(`/api/charts/fitness?days=${days}`);
    return data || [];
  },

  async getPowerZoneDistribution(days = 30): Promise<PowerZoneData[]> {
    const { data } = await apiClient.get<PowerZoneData[]>(
      `/api/charts/power-zones?days=${days}`
    );
    return data || [];
  },
};
