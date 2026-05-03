import { api } from './api';

export const intervalsIcuService = {
  async getAuthUrl(): Promise<string> {
    const { data, error } = await api.get<{ authUrl: string }>('/api/integrations/intervals-icu/auth-url', true);
    if (error) throw new Error(error.error || 'Failed to get auth URL');
    return data!.authUrl;
  },

  async getStatus(): Promise<{ connected: boolean; athlete_id?: string; auto_sync: boolean; use_wellness: boolean }> {
    const { data, error } = await api.get<{ connected: boolean; athlete_id?: string; auto_sync: boolean; use_wellness: boolean }>(
      '/api/integrations/intervals-icu/status', true
    );
    if (error) throw new Error(error.error || 'Failed to get status');
    return data!;
  },

  async disconnect(): Promise<void> {
    const { error } = await api.delete('/api/integrations/intervals-icu', true);
    if (error) throw new Error(error.error || 'Failed to disconnect');
  },

  async updateSettings(updates: { auto_sync?: boolean; use_wellness?: boolean }): Promise<void> {
    const { error } = await api.post('/api/integrations/intervals-icu/settings', updates, true);
    if (error) throw new Error(error.error || 'Failed to update settings');
  },

  async syncAll(): Promise<{ synced: number; failed: number; skipped: number; message: string }> {
    const { data, error } = await api.post<{ synced: number; failed: number; skipped: number; message: string }>(
      '/api/integrations/intervals-icu/sync-all', {}, true
    );
    if (error) throw new Error(error.error || 'Failed to sync workouts');
    return data!;
  },
};
