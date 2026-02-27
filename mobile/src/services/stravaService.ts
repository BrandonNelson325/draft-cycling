import apiClient from '../api/client';

export const stravaService = {
  async getAuthUrl(mobile = false): Promise<{ auth_url: string }> {
    const { data } = await apiClient.get<{ auth_url: string }>(
      `/api/strava/auth-url${mobile ? '?mobile=true' : ''}`
    );
    return data;
  },

  async connectStrava(params: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete_id: number;
  }) {
    const { data } = await apiClient.post('/api/strava/connect', params);
    return data;
  },

  async disconnectStrava() {
    const { data } = await apiClient.post('/api/strava/disconnect', {});
    return data;
  },

  async syncActivities() {
    const { data } = await apiClient.post('/api/strava/sync', {});
    return data;
  },

  async getActivities() {
    const { data } = await apiClient.get('/api/strava/activities');
    return data;
  },

  async getConnectionStatus() {
    const { data } = await apiClient.get('/api/strava/status');
    return data;
  },
};
