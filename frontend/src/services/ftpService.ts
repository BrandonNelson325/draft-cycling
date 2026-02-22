import { api } from './api';

interface FTPEstimate {
  estimated_ftp: number;
  confidence: number;
  based_on_rides: number;
  last_updated: string;
}

interface FTPHistory {
  date: string;
  ftp: number;
  source: string;
}

export const ftpService = {
  async getEstimate() {
    const { data, error } = await api.get<FTPEstimate>('/api/ftp/estimate', true);

    if (error) {
      throw new Error(error.error || 'Failed to fetch FTP estimate');
    }

    return data;
  },

  async updateFromEstimation() {
    const { data, error } = await api.post('/api/ftp/update', {}, true);

    if (error) {
      throw new Error(error.error || 'Failed to update FTP');
    }

    return data;
  },

  async getHistory() {
    const { data, error } = await api.get<FTPHistory[]>('/api/ftp/history', true);

    if (error) {
      throw new Error(error.error || 'Failed to fetch FTP history');
    }

    return data;
  },
};
