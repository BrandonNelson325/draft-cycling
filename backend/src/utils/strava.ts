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
      // force = always show the consent screen. With the default ('auto'),
      // Strava silently reuses a prior grant — so a user who once unchecked
      // "View data about your activities" could never re-grant it and would be
      // permanently stuck unable to sync. 'force' lets them fix it by reconnecting.
      approval_prompt: 'force',
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

  /**
   * Fetch activities with automatic pagination.
   * Strava caps per_page at 200 and returns up to that many per request.
   * This loops until a partial page is returned (indicating the last page).
   */
  async getActivities(
    accessToken: string,
    options: {
      before?: number; // epoch seconds
      after?: number; // epoch seconds
      per_page?: number;
    } = {}
  ): Promise<StravaActivity[]> {
    const perPage = options.per_page || 200;
    let page = 1;
    const allActivities: StravaActivity[] = [];

    while (true) {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
      });

      if (options.before) params.set('before', options.before.toString());
      if (options.after) params.set('after', options.after.toString());

      const response = await fetch(`${this.baseUrl}/athlete/activities?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        // Surface the REAL cause instead of a generic message, and give the
        // 401 case an actionable hint (almost always a missing activity scope).
        if (response.status === 401) {
          throw new Error(
            'Strava returned 401 (unauthorized). The athlete likely did not grant activity access — they need to reconnect Strava and allow "View data about your activities". ' +
              `Strava said: ${body.slice(0, 200)}`
          );
        }
        if (response.status === 429) {
          throw new Error('Strava rate limit reached (429). Try again in a few minutes.');
        }
        throw new Error(`Strava activities fetch failed (${response.status}): ${body.slice(0, 200)}`);
      }

      const batch = await response.json() as StravaActivity[];
      allActivities.push(...batch);

      // If we got fewer than per_page, we've hit the last page
      if (batch.length < perPage) break;

      page++;

      // Safety cap: don't fetch more than 10 pages (2000 activities)
      if (page > 10) break;
    }

    return allActivities;
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
