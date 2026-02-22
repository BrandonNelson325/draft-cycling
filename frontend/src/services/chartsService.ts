import { api } from './api';

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
  async getWeeklyData(weeks: number = 6): Promise<WeeklyData[]> {
    const { data, error } = await api.get<WeeklyData[]>(`/api/charts/weekly?weeks=${weeks}`, true);
    if (error) throw new Error(error.error || 'Failed to fetch weekly data');
    return data || [];
  },

  async getFitnessTimeSeries(days: number = 42): Promise<FitnessData[]> {
    const { data, error } = await api.get<FitnessData[]>(`/api/charts/fitness?days=${days}`, true);
    if (error) throw new Error(error.error || 'Failed to fetch fitness data');
    return data || [];
  },

  async getPowerZoneDistribution(days: number = 30): Promise<PowerZoneData[]> {
    const { data, error } = await api.get<PowerZoneData[]>(`/api/charts/power-zones?days=${days}`, true);
    if (error) throw new Error(error.error || 'Failed to fetch power zone data');
    return data || [];
  },
};
