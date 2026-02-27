import apiClient from '../api/client';

export interface TrainingStatus {
  ctl: number;
  atl: number;
  tsb: number;
  form_status: string;
  last_updated: string;
}

export interface MetricsHistory {
  dates: string[];
  ctl: number[];
  atl: number[];
  tsb: number[];
}

export const trainingService = {
  async getTrainingStatus(): Promise<TrainingStatus | null> {
    try {
      const { data } = await apiClient.get<TrainingStatus>('/api/training/status');
      return data;
    } catch {
      return null;
    }
  },

  async getMetricsHistory(days = 42): Promise<MetricsHistory | null> {
    try {
      const { data } = await apiClient.get<MetricsHistory>(
        `/api/training/metrics?days=${days}`
      );
      return data;
    } catch {
      return null;
    }
  },
};
