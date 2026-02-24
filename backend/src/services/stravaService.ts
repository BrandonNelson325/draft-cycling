import { supabaseAdmin } from '../utils/supabase';
import { stravaClient } from '../utils/strava';
import { powerAnalysisService } from './powerAnalysisService';
import { calculateTSS } from './trainingCalculations';
import { logger } from '../utils/logger';

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

    // Get athlete's FTP for TSS calculation
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp')
      .eq('id', athleteId)
      .single();

    const ftp = athlete?.ftp || 200; // Default FTP if not set

    const afterEpoch = options.after ? Math.floor(options.after.getTime() / 1000) : undefined;
    const beforeEpoch = options.before ? Math.floor(options.before.getTime() / 1000) : undefined;

    logger.debug(`Fetching activities from Strava (after: ${options.after?.toISOString()}, before: ${options.before?.toISOString()})...`);

    const activities = await stravaClient.getActivities(accessToken, {
      after: afterEpoch,
      before: beforeEpoch,
      per_page: 200,
    });

    logger.debug(`Received ${activities.length} activities from Strava`);

    // Filter for rides only
    const rides = activities.filter(
      (a) => a.sport_type === 'Ride' || a.type === 'Ride' || a.type === 'VirtualRide'
    );

    logger.debug(`Filtered to ${rides.length} rides`);

    if (rides.length > 0) {
      logger.debug('Sample activity data:', {
        id: rides[0].id,
        name: rides[0].name,
        distance: rides[0].distance,
        moving_time: rides[0].moving_time,
        type: rides[0].type,
        sport_type: rides[0].sport_type,
      });
    }

    // Store activities in database and analyze power curves
    const stored = [];
    const analyzed = [];

    for (const activity of rides) {
      logger.debug(`\n--- Processing activity: ${activity.name} (${activity.id}) ---`);
      logger.debug(`Raw data: distance=${activity.distance}m, moving_time=${activity.moving_time}s, watts=${activity.average_watts}`);

      // Calculate TSS if power data is available (use NP when available)
      let tss = null;
      if (activity.average_watts && activity.moving_time && ftp) {
        tss = calculateTSS(activity.moving_time, activity.average_watts, ftp, activity.weighted_average_watts);
        logger.debug(`Calculated TSS: ${tss} (NP: ${activity.weighted_average_watts || 'N/A'})`);
      }

      const activityData = {
        athlete_id: athleteId,
        strava_activity_id: activity.id,
        name: activity.name,
        start_date: activity.start_date,
        distance_meters: Math.round(activity.distance),
        moving_time_seconds: activity.moving_time,
        average_watts: activity.average_watts || null,
        tss: tss,
        raw_data: activity,
        synced_at: new Date().toISOString(),
      };

      logger.debug('Storing to database:', {
        name: activityData.name,
        distance_meters: activityData.distance_meters,
        moving_time_seconds: activityData.moving_time_seconds,
        average_watts: activityData.average_watts,
      });

      const { data, error } = await supabaseAdmin
        .from('strava_activities')
        .upsert(activityData, {
          onConflict: 'strava_activity_id',
        })
        .select()
        .single();

      if (error) {
        logger.error(`Failed to store activity ${activity.id}:`, error);
      } else if (data) {
        stored.push(data);
        logger.debug(`✅ Stored activity: ${activity.name} (${activity.id})`);

        // Analyze power curve if activity has power data
        if (activity.device_watts || activity.average_watts) {
          try {
            logger.debug(`Analyzing power for activity ${activity.id}...`);
            const powerCurve = await powerAnalysisService.analyzePowerCurve(
              athleteId,
              activity.id
            );
            if (powerCurve) {
              analyzed.push(activity.id);
              logger.debug(`✅ Power curve analyzed for ${activity.id}`);
            }
          } catch (err) {
            logger.error(`❌ Failed to analyze power for activity ${activity.id}:`, err);
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
