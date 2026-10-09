import { api } from './api';

export const whoopService = {
  async getAuthUrl(): Promise<string> {
    const { data, error } = await api.get<{ authUrl: string }>('/api/integrations/whoop/auth-url', true);
    if (error) throw new Error(error.error || 'Failed to get auth URL');
    return data!.authUrl;
  },

  async getStatus(): Promise<{ connected: boolean; last_sync_at: string | null }> {
    const { data, error } = await api.get<{ connected: boolean; last_sync_at: string | null }>('/api/integrations/whoop/status', true);
    if (error) throw new Error(error.error || 'Failed to get status');
    return data!;
  },

  async sync(days = 7): Promise<void> {
    const { error } = await api.post('/api/integrations/whoop/sync', { days }, true);
    if (error) throw new Error(error.error || 'Failed to sync');
  },

  async disconnect(): Promise<void> {
    const { error } = await api.delete('/api/integrations/whoop', true);
    if (error) throw new Error(error.error || 'Failed to disconnect');
  },
};
