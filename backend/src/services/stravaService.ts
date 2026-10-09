import { supabaseAdmin } from '../utils/supabase';
import { stravaClient } from '../utils/strava';
import { powerAnalysisService } from './powerAnalysisService';
import { calculateTSS } from './trainingCalculations';
import { trimLaps, analyzeIntervals } from './intervalAnalysisService';
import { logger } from '../utils/logger';
import { crossTrainingService } from './crossTrainingService';
import { isRideType, estimateActivityLoad } from '../utils/activityLoad';

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

    // Rides vs everything else. (The old inline list had a 'MountainBikRide'
    // typo, so mountain-bike rides were silently dropped.) Non-cycling
    // activities are rated for their effect on cycling and stored separately.
    const rides = activities.filter((a) => isRideType(a.sport_type, a.type));
    const others = activities.filter((a) => !isRideType(a.sport_type, a.type));
    if (others.length) {
      const phys = await crossTrainingService.physiology(athleteId);
      for (const o of others) await crossTrainingService.store(athleteId, o, phys);
      logger.debug(`Stored ${others.length} cross-training activities`);
    }

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

      // Power TSS when there's power; otherwise an HR/duration estimate so a
      // ride without a power meter still counts toward fitness and fatigue.
      const { tss, source: tssSource } = await this.rideTss(athleteId, activity, ftp);

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
        if (tssSource) await this.markTssSource(activity.id, tssSource);
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

    // One-time per athlete: pull ~120 days of non-cycling history and give old
    // no-power rides a load estimate.
    void this.backfillCrossTraining(athleteId).catch((e) => logger.warn('[CrossTraining] backfill failed:', e?.message));

    return { synced: stored.length, total: rides.length, analyzed: analyzed.length, newIds, crossTraining: others.length };
  },

  /** Ride TSS: power (NP) when available, else HR estimate, else duration estimate. */
  async rideTss(athleteId: string, activity: any, ftp?: number | null): Promise<{ tss: number | null; source: 'power' | 'hr' | 'duration' | null }> {
    if (activity.average_watts && activity.moving_time && ftp) {
      return { tss: calculateTSS(activity.moving_time, activity.average_watts, ftp, activity.weighted_average_watts), source: 'power' };
    }
    if (!activity.moving_time) return { tss: null, source: null };
    const p = await crossTrainingService.physiology(athleteId);
    const est = estimateActivityLoad({
      sportType: activity.sport_type || 'Ride', type: activity.type, movingTimeSeconds: activity.moving_time,
      averageHeartrate: activity.average_heartrate, maxHr: p.maxHr, restingHr: p.restingHr, age: p.age,
    });
    return { tss: Math.round(est.estTss), source: est.method };
  },

  /** Best-effort: tss_source column arrives with migration 041. */
  async markTssSource(stravaActivityId: number, source: 'power' | 'hr' | 'duration') {
    await supabaseAdmin.from('strava_activities').update({ tss_source: source }).eq('strava_activity_id', stravaActivityId);
  },

  async backfillCrossTraining(athleteId: string, days = 120): Promise<void> {
    const { data: a, error } = await supabaseAdmin
      .from('athletes').select('cross_training_backfilled_at, ftp').eq('id', athleteId).single();
    if (error || a?.cross_training_backfilled_at) return; // done, or migration 041 not run yet

    const accessToken = await this.ensureValidToken(athleteId);
    const after = Math.floor((Date.now() - days * 86400000) / 1000);
    const phys = await crossTrainingService.physiology(athleteId);
    let stored = 0;
    // getActivities already walks every page.
    const all: any[] = await stravaClient.getActivities(accessToken, { after, per_page: 200 });
    for (const o of all.filter((x) => !isRideType(x.sport_type, x.type))) {
      if (await crossTrainingService.store(athleteId, o, phys)) stored++;
    }

    // Old rides with no power had NO load — estimate from stored raw data (no API calls).
    const { data: noTss } = await supabaseAdmin
      .from('strava_activities').select('strava_activity_id, raw_data')
      .eq('athlete_id', athleteId).is('tss', null).gte('start_date', new Date(after * 1000).toISOString());
    let estimated = 0;
    for (const r of noTss || []) {
      const { tss, source } = await this.rideTss(athleteId, r.raw_data || {}, a?.ftp);
      if (tss == null) continue;
      await supabaseAdmin.from('strava_activities').update({ tss, tss_source: source }).eq('strava_activity_id', r.strava_activity_id);
      estimated++;
    }

    await supabaseAdmin.from('athletes').update({ cross_training_backfilled_at: new Date().toISOString() }).eq('id', athleteId);
    logger.info(`[CrossTraining] backfill for ${athleteId}: ${stored} activities, ${estimated} no-power rides estimated`);
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
