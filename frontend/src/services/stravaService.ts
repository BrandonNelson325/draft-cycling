import { api } from './api';

export const stravaService = {
  async getAuthUrl() {
    const { data, error } = await api.get('/api/strava/auth-url', true);

    if (error) {
      throw new Error(error.error || 'Failed to get Strava auth URL');
    }

    return data;
  },

  async connectStrava(params: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete_id: number;
  }) {
    const { data, error } = await api.post('/api/strava/connect', params, true);

    if (error) {
      throw new Error(error.error || 'Failed to connect Strava');
    }

    return data;
  },

  async disconnectStrava() {
    const { data, error } = await api.post('/api/strava/disconnect', {}, true);

    if (error) {
      throw new Error(error.error || 'Failed to disconnect Strava');
    }

    return data;
  },

  async syncActivities() {
    const { data, error } = await api.post('/api/strava/sync', {}, true);

    if (error) {
      throw new Error(error.error || 'Failed to sync activities');
    }

    return data;
  },

  async getActivities() {
    const { data, error } = await api.get('/api/strava/activities', true);

    if (error) {
      throw new Error(error.error || 'Failed to fetch activities');
    }

    return data;
  },

  async getConnectionStatus() {
    const { data, error } = await api.get('/api/strava/status', true);

    if (error) {
      throw new Error(error.error || 'Failed to get connection status');
    }

    return data;
  },
};
