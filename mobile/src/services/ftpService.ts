import apiClient from '../api/client';

export interface FTPEstimate {
  estimated_ftp: number;
  confidence: number;
  based_on_rides: number;
  last_updated: string;
}

export interface FTPHistory {
  date: string;
  ftp: number;
  source: string;
}

export const ftpService = {
  async getEstimate(): Promise<FTPEstimate | null> {
    try {
      const { data } = await apiClient.get<FTPEstimate>('/api/ftp/estimate');
      return data;
    } catch {
      return null;
    }
  },

  async updateFromEstimation() {
    const { data } = await apiClient.post('/api/ftp/update', {});
    return data;
  },

  async getHistory(): Promise<FTPHistory[]> {
    try {
      const { data } = await apiClient.get<FTPHistory[]>('/api/ftp/history');
      return data || [];
    } catch {
      return [];
    }
  },
};
