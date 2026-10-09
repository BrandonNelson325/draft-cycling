import apiClient from '../api/client';

export const whoopService = {
  async getAuthUrl(): Promise<string> {
    const { data } = await apiClient.get<{ authUrl: string }>('/api/integrations/whoop/auth-url?mobile=true');
    return data.authUrl;
  },

  async getStatus(): Promise<{ connected: boolean; last_sync_at: string | null }> {
    const { data } = await apiClient.get('/api/integrations/whoop/status');
    return data;
  },

  async sync(days = 2): Promise<void> {
    await apiClient.post('/api/integrations/whoop/sync', { days });
  },

  async disconnect(): Promise<void> {
    await apiClient.delete('/api/integrations/whoop');
  },
};
