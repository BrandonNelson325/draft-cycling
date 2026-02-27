import apiClient from '../api/client';

export interface MetricsData {
  period: string;
  total_distance_meters: number;
  total_time_seconds: number;
  total_elevation_meters: number;
  total_tss: number;
  ride_count: number;
  avg_distance_meters: number;
  avg_time_seconds: number;
  power_prs: {
    power_5sec: number;
    power_1min: number;
    power_5min: number;
    power_20min: number;
  };
}

export const metricsService = {
  async getMetrics(period: 'week' | 'month' | 'year' | 'all' = 'week'): Promise<MetricsData> {
    const { data } = await apiClient.get<MetricsData>(`/api/metrics?period=${period}`);
    return data;
  },
};
