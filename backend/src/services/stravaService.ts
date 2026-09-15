import { supabaseAdmin } from '../utils/supabase';
import { stravaClient } from '../utils/strava';
import { powerAnalysisService } from './powerAnalysisService';
import { calculateTSS } from './trainingCalculations';
import { trimLaps, analyzeIntervals } from './intervalAnalysisService';
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

  async syncActivities(athleteId: string, options: { after?: Date; before?: Date; skipPowerAnalysis?: boolean } = {}) {
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

    // Filter for all cycling types (Strava uses both type and sport_type fields)
    const cyclingTypes = new Set([
      'Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikRide',
      'Velomobile', 'Handcycle',
    ]);
    const rides = activities.filter(
      (a) => cyclingTypes.has(a.sport_type) || cyclingTypes.has(a.type)
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

    // Check which strava_activity_ids already exist so we only flag genuinely new ones
    const stravaIds = rides.map((r) => r.id);
    const { data: existingRows } = await supabaseAdmin
      .from('strava_activities')
      .select('strava_activity_id')
      .eq('athlete_id', athleteId)
      .in('strava_activity_id', stravaIds);
    const existingSet = new Set((existingRows || []).map((r: any) => r.strava_activity_id));

    // Store activities in database and analyze power curves
    const stored = [];
    const analyzed = [];
    const newIds: number[] = [];

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
        if (!existingSet.has(activity.id)) {
          newIds.push(activity.id);
        }
        logger.debug(`✅ Stored activity: ${activity.name} (${activity.id})${!existingSet.has(activity.id) ? ' [NEW]' : ' [updated]'}`);

        // Analyze power curve if activity has power data
        // Skip during bulk sync (initial connect) to avoid Strava rate limits
        if (!options.skipPowerAnalysis && (activity.device_watts || activity.average_watts)) {
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

          // Capture per-lap interval data for NEW powered rides only (one extra
          // detail call per ride; skipped on bulk connect via skipPowerAnalysis).
          if (!existingSet.has(activity.id)) {
            try {
              await this.buildIntervalAnalysisForActivity(athleteId, data, { accessToken, ftp });
            } catch (err) {
              logger.error(`❌ Failed to capture intervals for activity ${activity.id}:`, err);
            }
          }
        }
      }
    }

    return { synced: stored.length, total: rides.length, analyzed: analyzed.length, newIds };
  },

  /**
   * Fetch a ride's laps from Strava's activity-detail endpoint, compute the
   * interval breakdown, and persist both onto the strava_activities row.
   * Returns the analysis. Used two ways:
   *   1. Eagerly during incremental sync for new powered rides.
   *   2. Lazily by the coach when it analyzes an older ride that predates this
   *      feature (row has no `laps` yet) — see aiToolExecutor.getActivityDetails.
   * `opts` lets the sync loop reuse its already-fetched token + FTP.
   */
  async buildIntervalAnalysisForActivity(
    athleteId: string,
    dbActivity: { id: string; strava_activity_id: number },
    opts: { accessToken?: string; ftp?: number } = {}
  ) {
    const accessToken = opts.accessToken || (await this.ensureValidToken(athleteId));

    let ftp = opts.ftp;
    if (ftp == null) {
      const { data: athlete } = await supabaseAdmin
        .from('athletes')
        .select('ftp')
        .eq('id', athleteId)
        .single();
      ftp = athlete?.ftp || 0;
    }

    const detail: any = await stravaClient.getActivity(accessToken, dbActivity.strava_activity_id);
    const laps = trimLaps(detail?.laps || []);
    const analysis = analyzeIntervals(laps, ftp || 0);

    await supabaseAdmin
      .from('strava_activities')
      .update({ laps, interval_analysis: analysis })
      .eq('id', dbActivity.id)
      .eq('athlete_id', athleteId);

    return analysis;
  },

  async getActivityWithStreams(athleteId: string, stravaActivityId: number) {
    const accessToken = await this.ensureValidToken(athleteId);

    // Only the power stream is consumed downstream (power-curve analysis), so we
    // skip the separate activity-detail request — that halves the Strava API cost
    // per activity, which matters when backfilling many historical rides at once.
    const streams = await stravaClient.getActivityStreams(accessToken, stravaActivityId);

    return { activity: null, streams };
  },
};
