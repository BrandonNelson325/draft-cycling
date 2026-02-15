import { config } from '../config';

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
  };
}

interface StravaActivity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  device_watts?: boolean;
  has_heartrate: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
}

class StravaClient {
  private baseUrl = 'https://www.strava.com/api/v3';
  private authUrl = 'https://www.strava.com/oauth';

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: config.strava.clientId,
      redirect_uri: config.strava.redirectUri,
      response_type: 'code',
      scope: 'read,activity:read_all,activity:write',
      state,
    });

    return `${this.authUrl}/authorize?${params.toString()}`;
  }

  async exchangeToken(code: string): Promise<StravaTokenResponse> {
    const response = await fetch(`${this.authUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.strava.clientId,
        client_secret: config.strava.clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || 'Failed to exchange token');
    }

    return response.json() as Promise<StravaTokenResponse>;
  }

  async refreshToken(refreshToken: string): Promise<StravaTokenResponse> {
    const response = await fetch(`${this.authUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.strava.clientId,
        client_secret: config.strava.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || 'Failed to refresh token');
    }

    return response.json() as Promise<StravaTokenResponse>;
  }

  async getAthlete(accessToken: string) {
    const response = await fetch(`${this.baseUrl}/athlete`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch athlete data');
    }

    return response.json();
  }

  async getActivities(
    accessToken: string,
    options: {
      before?: number; // epoch seconds
      after?: number; // epoch seconds
      page?: number;
      per_page?: number;
    } = {}
  ): Promise<StravaActivity[]> {
    const params = new URLSearchParams({
      page: (options.page || 1).toString(),
      per_page: (options.per_page || 30).toString(),
    });

    if (options.before) params.set('before', options.before.toString());
    if (options.after) params.set('after', options.after.toString());

    const response = await fetch(`${this.baseUrl}/athlete/activities?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch activities');
    }

    return response.json() as Promise<StravaActivity[]>;
  }

  async getActivity(accessToken: string, activityId: number) {
    const response = await fetch(`${this.baseUrl}/activities/${activityId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch activity');
    }

    return response.json();
  }

  async getActivityStreams(
    accessToken: string,
    activityId: number,
    keys: string[] = ['time', 'watts', 'heartrate', 'cadence', 'distance', 'altitude']
  ) {
    const keysParam = keys.join(',');
    const response = await fetch(
      `${this.baseUrl}/activities/${activityId}/streams?keys=${keysParam}&key_by_type=true`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      // 404 is common if activity doesn't have power data
      if (response.status === 404) {
        return null;
      }
      throw new Error('Failed to fetch activity streams');
    }

    return response.json();
  }

  async createWebhookSubscription(callbackUrl: string, verifyToken: string) {
    const response = await fetch(`${this.baseUrl}/push_subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.strava.clientId,
        client_secret: config.strava.clientSecret,
        callback_url: callbackUrl,
        verify_token: verifyToken,
      }),
    });

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.message || 'Failed to create webhook subscription');
    }

    return response.json();
  }

  async viewWebhookSubscription() {
    const response = await fetch(
      `${this.baseUrl}/push_subscriptions?client_id=${config.strava.clientId}&client_secret=${config.strava.clientSecret}`
    );

    if (!response.ok) {
      throw new Error('Failed to view webhook subscription');
    }

    return response.json();
  }

  async deleteWebhookSubscription(subscriptionId: number) {
    const response = await fetch(
      `${this.baseUrl}/push_subscriptions/${subscriptionId}?client_id=${config.strava.clientId}&client_secret=${config.strava.clientSecret}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error('Failed to delete webhook subscription');
    }

    return response.json();
  }
}

export const stravaClient = new StravaClient();
export type { StravaActivity, StravaTokenResponse };
