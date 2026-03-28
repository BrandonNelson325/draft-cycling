import { api } from './api';

export const wahooService = {
  async getAuthUrl(): Promise<string> {
    const { data, error } = await api.get<{ authUrl: string }>('/api/integrations/wahoo/auth-url', true);
    if (error) throw new Error(error.error || 'Failed to get auth URL');
    return data!.authUrl;
  },

  async getStatus(): Promise<{ connected: boolean; user_id?: string; auto_sync: boolean }> {
    const { data, error } = await api.get<{ connected: boolean; user_id?: string; auto_sync: boolean }>(
      '/api/integrations/wahoo/status', true
    );
    if (error) throw new Error(error.error || 'Failed to get status');
    return data!;
  },

  async disconnect(): Promise<void> {
    const { error } = await api.delete('/api/integrations/wahoo', true);
    if (error) throw new Error(error.error || 'Failed to disconnect');
  },

  async updateSettings(autoSync: boolean): Promise<void> {
    const { error } = await api.post('/api/integrations/wahoo/settings', { auto_sync: autoSync }, true);
    if (error) throw new Error(error.error || 'Failed to update settings');
  },

  async syncWorkout(workoutId: string, scheduledDate: string, calendarEntryId?: string): Promise<void> {
    const { error } = await api.post('/api/integrations/wahoo/sync', {
      workout_id: workoutId,
      scheduled_date: scheduledDate,
      calendar_entry_id: calendarEntryId,
    }, true);
    if (error) throw new Error(error.error || 'Failed to sync workout');
  },
};
