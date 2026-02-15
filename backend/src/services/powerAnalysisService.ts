import { supabaseAdmin } from '../utils/supabase';
import { stravaService } from './stravaService';

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
      // Get activity with power streams
      const { activity, streams } = await stravaService.getActivityWithStreams(
        athleteId,
        stravaActivityId
      );

      // Check if activity has power data
      const streamsData = streams as any;
      if (!streamsData || !streamsData.watts || !streamsData.watts.data) {
        console.log(`Activity ${stravaActivityId} has no power data`);
        return null;
      }

      const powerData: number[] = streamsData.watts.data;

      // Calculate best efforts for standard durations
      const durations = {
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
        console.error('Error storing power curve:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error analyzing power curve:', error);
      return null;
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
      console.error('Error getting personal records:', error);
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
      console.error('Error getting activity power curve:', error);
      return null;
    }
  },
};
