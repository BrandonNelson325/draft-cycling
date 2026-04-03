import apiClient from '../api/client';

export const intervalsIcuService = {
  async getAuthUrl(): Promise<string> {
    const { data } = await apiClient.get<{ authUrl: string }>('/api/integrations/intervals-icu/auth-url');
    return data.authUrl;
  },

  async getStatus(): Promise<{ connected: boolean; athlete_id?: string; auto_sync: boolean }> {
    const { data } = await apiClient.get('/api/integrations/intervals-icu/status');
    return data;
  },

  async disconnect(): Promise<void> {
    await apiClient.delete('/api/integrations/intervals-icu');
  },

  async updateSettings(autoSync: boolean): Promise<void> {
    await apiClient.post('/api/integrations/intervals-icu/settings', { auto_sync: autoSync });
  },
};
