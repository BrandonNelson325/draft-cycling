import { supabaseAdmin } from '../utils/supabase';
import { stravaService } from './stravaService';
import { logger } from '../utils/logger';

interface PowerCurve {
  duration_seconds: number;
  average_power: number;
  start_index: number;
  end_index: number;
}

export const powerAnalysisService = {
  /**
   * Calculate best average power for a given duration from power stream
   */
  calculateBestEffort(powerData: number[], durationSeconds: number): PowerCurve | null {
    if (!powerData || powerData.length === 0) {
      return null;
    }

    // Need at least durationSeconds of data
    if (powerData.length < durationSeconds) {
      return null;
    }

    let bestAvg = 0;
    let bestStart = 0;

    // Sliding window to find best average
    for (let i = 0; i <= powerData.length - durationSeconds; i++) {
      const window = powerData.slice(i, i + durationSeconds);
      const avg = window.reduce((sum, val) => sum + val, 0) / durationSeconds;

      if (avg > bestAvg) {
        bestAvg = avg;
        bestStart = i;
      }
    }

    return {
      duration_seconds: durationSeconds,
      average_power: Math.round(bestAvg),
      start_index: bestStart,
      end_index: bestStart + durationSeconds,
    };
  },

  /**
   * Analyze activity power data and extract all best efforts
   */
  async analyzePowerCurve(athleteId: string, stravaActivityId: number) {
    try {
      // Get activity power streams
      const { streams } = await stravaService.getActivityWithStreams(
        athleteId,
        stravaActivityId
      );

      // Check if activity has power data
      const streamsData = streams as any;
      if (!streamsData || !streamsData.watts || !streamsData.watts.data) {
        logger.debug(`Activity ${stravaActivityId} has no power data`);
        return null;
      }

      const powerData: number[] = streamsData.watts.data;

      // Calculate best efforts for standard durations
      const durations = {
        power_5sec: 5,
        power_15sec: 15,
        power_30sec: 30,
        power_1min: 60,
        power_3min: 180,
        power_5min: 300,
        power_8min: 480,
        power_10min: 600,
        power_15min: 900,
        power_20min: 1200,
        power_30min: 1800,
        power_45min: 2700,
        power_60min: 3600,
      };

      const powerCurve: any = {
        athlete_id: athleteId,
        strava_activity_id: stravaActivityId,
      };

      for (const [key, seconds] of Object.entries(durations)) {
        const effort = this.calculateBestEffort(powerData, seconds);
        if (effort) {
          powerCurve[key] = effort.average_power;
        }
      }

      // Store in database
      const { data, error } = await supabaseAdmin
        .from('power_curves')
        .upsert(powerCurve, {
          onConflict: 'athlete_id,strava_activity_id',
        })
        .select()
        .single();

      if (error) {
        logger.error('Error storing power curve:', error);
        return null;
      }

      return data;
    } catch (error) {
      logger.error('Error analyzing power curve:', error);
      return null;
    }
  },

  /**
   * Backfill power curves for historical activities that have power data but no
   * power_curves row yet. The initial Strava connect skips per-activity power
   * analysis to avoid rate limits, which left the power curve (and therefore FTP
   * estimation) starved until enough NEW rides trickled in — the main reason
   * estimated FTP read far too low right after connecting.
   *
   * This processes the un-analyzed activities newest-first, throttled and capped
   * so it stays well under Strava's rate limits (100 req / 15 min). It stops
   * gracefully on a rate-limit error so it can resume on the next sync.
   */
  async backfillPowerCurves(
    athleteId: string,
    opts: { maxActivities?: number; delayMs?: number } = {}
  ): Promise<{ analyzed: number; remaining: number }> {
    const maxActivities = opts.maxActivities ?? 60;
    const delayMs = opts.delayMs ?? 700;

    try {
      // Rides from a real power meter, newest first. We filter on device_watts (not
      // just average_watts) so we don't burn Strava API calls repeatedly on rides
      // with only Strava-*estimated* power — those have no power stream, so
      // analyzePowerCurve returns null, they never get marked done, and (processing
      // newest-first) they'd otherwise starve older real-power rides every sync.
      const { data: activities, error } = await supabaseAdmin
        .from('strava_activities')
        .select('strava_activity_id, start_date')
        .eq('athlete_id', athleteId)
        .filter('raw_data->>device_watts', 'eq', 'true')
        .order('start_date', { ascending: false })
        .limit(300);

      if (error || !activities || activities.length === 0) {
        return { analyzed: 0, remaining: 0 };
      }

      // Which of those already have a power curve?
      const { data: existing } = await supabaseAdmin
        .from('power_curves')
        .select('strava_activity_id')
        .eq('athlete_id', athleteId);
      const analyzedSet = new Set((existing || []).map((c) => c.strava_activity_id));

      const pending = activities.filter(
        (a) => !analyzedSet.has(a.strava_activity_id)
      );

      let analyzed = 0;
      for (const activity of pending.slice(0, maxActivities)) {
        try {
          const curve = await this.analyzePowerCurve(athleteId, activity.strava_activity_id);
          if (curve) analyzed++;
        } catch (err: any) {
          // Stop the whole backfill on a rate-limit hit — the next sync resumes it
          if (typeof err?.message === 'string' && err.message.includes('429')) {
            logger.warn(`Power curve backfill hit Strava rate limit after ${analyzed} activities; will resume next sync`);
            break;
          }
          logger.error(`Backfill failed for activity ${activity.strava_activity_id}:`, err);
        }
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }

      const remaining = Math.max(0, pending.length - analyzed);
      logger.debug(`Power curve backfill for ${athleteId}: analyzed ${analyzed}, ${remaining} remaining`);
      return { analyzed, remaining };
    } catch (error) {
      logger.error('Error backfilling power curves:', error);
      return { analyzed: 0, remaining: 0 };
    }
  },

  /**
   * Get athlete's best power efforts across all rides
   */
  async getPersonalRecords(athleteId: string) {
    try {
      const { data: curves, error } = await supabaseAdmin
        .from('power_curves')
        .select('*')
        .eq('athlete_id', athleteId);

      if (error || !curves || curves.length === 0) {
        return null;
      }

      // Calculate PRs for each duration
      const prs: any = {
        power_5sec: { power: 0, activity_id: null, date: null },
        power_15sec: { power: 0, activity_id: null, date: null },
        power_30sec: { power: 0, activity_id: null, date: null },
        power_1min: { power: 0, activity_id: null, date: null },
        power_3min: { power: 0, activity_id: null, date: null },
        power_5min: { power: 0, activity_id: null, date: null },
        power_8min: { power: 0, activity_id: null, date: null },
        power_10min: { power: 0, activity_id: null, date: null },
        power_15min: { power: 0, activity_id: null, date: null },
        power_20min: { power: 0, activity_id: null, date: null },
        power_30min: { power: 0, activity_id: null, date: null },
        power_45min: { power: 0, activity_id: null, date: null },
        power_60min: { power: 0, activity_id: null, date: null },
      };

      for (const curve of curves) {
        for (const key of Object.keys(prs)) {
          if (curve[key] && curve[key] > prs[key].power) {
            prs[key] = {
              power: curve[key],
              activity_id: curve.strava_activity_id,
              date: curve.created_at,
            };
          }
        }
      }

      return prs;
    } catch (error) {
      logger.error('Error getting personal records:', error);
      return null;
    }
  },

  /**
   * Get power curve for a specific activity
   */
  async getActivityPowerCurve(athleteId: string, stravaActivityId: number) {
    try {
      const { data, error } = await supabaseAdmin
        .from('power_curves')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('strava_activity_id', stravaActivityId)
        .single();

      if (error) {
        return null;
      }

      return data;
    } catch (error) {
      logger.error('Error getting activity power curve:', error);
      return null;
    }
  },
};
