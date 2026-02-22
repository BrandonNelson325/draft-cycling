import { api } from './api';

interface TrainingStatus {
  ctl: number;
  atl: number;
  tsb: number;
  form_status: string;
  last_updated: string;
}

interface MetricsHistory {
  dates: string[];
  ctl: number[];
  atl: number[];
  tsb: number[];
}

export const trainingService = {
  async getTrainingStatus() {
    const { data, error } = await api.get<TrainingStatus>('/api/training/status', true);

    if (error) {
      throw new Error(error.error || 'Failed to fetch training status');
    }

    return data;
  },

  async getMetricsHistory(days: number = 42) {
    const { data, error } = await api.get<MetricsHistory>(
      `/api/training/metrics?days=${days}`,
      true
    );

    if (error) {
      throw new Error(error.error || 'Failed to fetch metrics history');
    }

    return data;
  },
};
