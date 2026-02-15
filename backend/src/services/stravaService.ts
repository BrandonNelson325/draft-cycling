import { supabaseAdmin } from '../utils/supabase';
import { stravaClient } from '../utils/strava';
import { powerAnalysisService } from './powerAnalysisService';

export const stravaService = {
  async ensureValidToken(athleteId: string) {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('strava_access_token, strava_refresh_token, strava_token_expires_at')
      .eq('id', athleteId)
      .single();

    if (!athlete?.strava_refresh_token) {
      throw new Error('Strava not connected');
    }

    // Check if token is expired or will expire soon (within 10 minutes)
    const expiresAt = new Date(athlete.strava_token_expires_at!);
    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    if (expiresAt < tenMinutesFromNow) {
      // Refresh the token
      const tokenData = await stravaClient.refreshToken(athlete.strava_refresh_token);

      // Update in database
      await supabaseAdmin
        .from('athletes')
        .update({
          strava_access_token: tokenData.access_token,
          strava_refresh_token: tokenData.refresh_token,
          strava_token_expires_at: new Date(tokenData.expires_at * 1000).toISOString(),
        })
        .eq('id', athleteId);

      return tokenData.access_token;
    }

    return athlete.strava_access_token!;
  },

  async syncActivities(athleteId: string, options: { after?: Date; before?: Date } = {}) {
    const accessToken = await this.ensureValidToken(athleteId);

    const afterEpoch = options.after ? Math.floor(options.after.getTime() / 1000) : undefined;
    const beforeEpoch = options.before ? Math.floor(options.before.getTime() / 1000) : undefined;

    const activities = await stravaClient.getActivities(accessToken, {
      after: afterEpoch,
      before: beforeEpoch,
      per_page: 200,
    });

    // Filter for rides only
    const rides = activities.filter(
      (a) => a.sport_type === 'Ride' || a.type === 'Ride' || a.type === 'VirtualRide'
    );

    // Store activities in database and analyze power curves
    const stored = [];
    const analyzed = [];

    for (const activity of rides) {
      const { data, error } = await supabaseAdmin
        .from('strava_activities')
        .upsert(
          {
            athlete_id: athleteId,
            strava_activity_id: activity.id,
            name: activity.name,
            start_date: activity.start_date,
            distance_meters: Math.round(activity.distance),
            moving_time_seconds: activity.moving_time,
            average_watts: activity.average_watts || null,
            raw_data: activity,
            synced_at: new Date().toISOString(),
          },
          {
            onConflict: 'strava_activity_id',
          }
        )
        .select()
        .single();

      if (!error && data) {
        stored.push(data);

        // Analyze power curve if activity has power data
        if (activity.device_watts || activity.average_watts) {
          try {
            const powerCurve = await powerAnalysisService.analyzePowerCurve(
              athleteId,
              activity.id
            );
            if (powerCurve) {
              analyzed.push(activity.id);
            }
          } catch (err) {
            console.error(`Failed to analyze power for activity ${activity.id}:`, err);
          }
        }
      }
    }

    return { synced: stored.length, total: rides.length, analyzed: analyzed.length };
  },

  async getActivityWithStreams(athleteId: string, stravaActivityId: number) {
    const accessToken = await this.ensureValidToken(athleteId);

    // Get detailed activity
    const activity = await stravaClient.getActivity(accessToken, stravaActivityId);

    // Get streams (power, HR, etc.)
    const streams = await stravaClient.getActivityStreams(accessToken, stravaActivityId);

    return { activity, streams };
  },
};
