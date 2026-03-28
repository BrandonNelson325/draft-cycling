import apiClient from '../api/client';

export const wahooService = {
  async getAuthUrl(): Promise<string> {
    const { data } = await apiClient.get<{ authUrl: string }>('/api/integrations/wahoo/auth-url?mobile=true');
    return data.authUrl;
  },

  async getStatus(): Promise<{ connected: boolean; user_id?: string; auto_sync: boolean }> {
    const { data } = await apiClient.get('/api/integrations/wahoo/status');
    return data;
  },

  async disconnect(): Promise<void> {
    await apiClient.delete('/api/integrations/wahoo');
  },

  async updateSettings(autoSync: boolean): Promise<void> {
    await apiClient.post('/api/integrations/wahoo/settings', { auto_sync: autoSync });
  },

  async syncWorkout(workoutId: string, scheduledDate: string, calendarEntryId?: string): Promise<void> {
    await apiClient.post('/api/integrations/wahoo/sync', {
      workout_id: workoutId,
      scheduled_date: scheduledDate,
      calendar_entry_id: calendarEntryId,
    });
  },
};
