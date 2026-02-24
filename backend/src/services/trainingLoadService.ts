import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';

interface TrainingLoad {
  ctl: number; // Chronic Training Load (42-day exponential moving average)
  atl: number; // Acute Training Load (7-day exponential moving average)
  tsb: number; // Training Stress Balance (CTL - ATL)
}

interface TrainingStatus {
  status: 'fresh' | 'optimal' | 'productive' | 'overreaching' | 'overtraining';
  description: string;
  recommendation: string;
}

export const trainingLoadService = {
  /**
   * Calculate TSS (Training Stress Score) for a ride
   * Formula: TSS = (seconds * NP * IF) / (FTP * 3600) * 100
   * Uses Normalized Power when available for accurate variable-power TSS.
   */
  calculateTSS(durationSeconds: number, avgPower: number, ftp: number, normalizedPower?: number): number {
    if (!ftp || ftp === 0) {
      return 0;
    }

    // Use Normalized Power when available, fall back to average power
    const np = normalizedPower && normalizedPower > 0 ? normalizedPower : avgPower;
    const hours = durationSeconds / 3600;
    const intensityFactor = np / ftp;
    const tss = hours * intensityFactor * intensityFactor * 100;

    return Math.round(tss);
  },

  /**
   * Update TSS for all activities that have power data but no TSS yet
   */
  async updateActivityTSS(athleteId: string) {
    try {
      // Get athlete FTP
      const { data: athlete } = await supabaseAdmin
        .from('athletes')
        .select('ftp')
        .eq('id', athleteId)
        .single();

      if (!athlete?.ftp) {
        logger.debug('No FTP set for athlete, cannot calculate TSS');
        return;
      }

      // Get activities without TSS that have power data
      const { data: activities } = await supabaseAdmin
        .from('strava_activities')
        .select('id, strava_activity_id, average_watts, moving_time_seconds, raw_data')
        .eq('athlete_id', athleteId)
        .not('average_watts', 'is', null)
        .is('tss', null);

      if (!activities || activities.length === 0) {
        return;
      }

      // Calculate and update TSS (using NP from raw_data when available)
      for (const activity of activities) {
        const normalizedPower = activity.raw_data?.weighted_average_watts || undefined;
        const tss = this.calculateTSS(
          activity.moving_time_seconds,
          activity.average_watts!,
          athlete.ftp,
          normalizedPower
        );

        await supabaseAdmin
          .from('strava_activities')
          .update({ tss })
          .eq('id', activity.id);
      }

      logger.debug(`Updated TSS for ${activities.length} activities`);
    } catch (error) {
      logger.error('Error updating activity TSS:', error);
    }
  },

  /**
   * Calculate CTL, ATL, TSB for a given date using per-day EMA.
   * Iterates every calendar day (including rest days) so decay is applied correctly.
   * Uses 90-day lookback to let the 42-day CTL EMA seed properly.
   */
  async calculateTrainingLoad(athleteId: string, date: Date = new Date()): Promise<TrainingLoad | null> {
    try {
      // 90-day lookback lets the 42-day EMA seed properly
      const lookbackDays = 90;
      const startDate = new Date(date);
      startDate.setDate(startDate.getDate() - lookbackDays);

      const { data: activities } = await supabaseAdmin
        .from('strava_activities')
        .select('start_date, tss')
        .eq('athlete_id', athleteId)
        .gte('start_date', startDate.toISOString())
        .lte('start_date', date.toISOString())
        .not('tss', 'is', null)
        .order('start_date', { ascending: true });

      if (!activities || activities.length === 0) {
        return null;
      }

      // Build Map<dayString, summedTSS> to aggregate multiple activities per day
      const dailyTSS = new Map<string, number>();
      for (const activity of activities) {
        const dayKey = new Date(activity.start_date).toISOString().split('T')[0];
        dailyTSS.set(dayKey, (dailyTSS.get(dayKey) || 0) + (activity.tss || 0));
      }

      // Iterate every calendar day from start to target, applying decay on rest days
      const ctlTimeConstant = 42;
      const atlTimeConstant = 7;

      let ctl = 0;
      let atl = 0;

      const current = new Date(startDate);
      current.setUTCHours(0, 0, 0, 0);
      const target = new Date(date);
      target.setUTCHours(0, 0, 0, 0);

      while (current <= target) {
        const dayKey = current.toISOString().split('T')[0];
        const tss = dailyTSS.get(dayKey) || 0;

        // Standard EMA: EMA_today = EMA_yesterday + (dailyTSS - EMA_yesterday) / timeConstant
        ctl = ctl + (tss - ctl) / ctlTimeConstant;
        atl = atl + (tss - atl) / atlTimeConstant;

        current.setDate(current.getDate() + 1);
      }

      const tsb = ctl - atl;

      return {
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        tsb: Math.round(tsb * 10) / 10,
      };
    } catch (error) {
      logger.error('Error calculating training load:', error);
      return null;
    }
  },

  /**
   * Determine training status from TSB
   */
  determineStatus(tsb: number): TrainingStatus {
    if (tsb > 10) {
      return {
        status: 'fresh',
        description: 'You are well-rested and ready for hard efforts',
        recommendation: 'Good time for high-intensity training or racing',
      };
    } else if (tsb >= -5) {
      return {
        status: 'optimal',
        description: 'You are in an optimal training zone',
        recommendation: 'Continue with planned training, mix of intensity and volume',
      };
    } else if (tsb >= -15) {
      return {
        status: 'productive',
        description: 'You are carrying fatigue but adapting well',
        recommendation: 'Maintain current training load, recovery is important',
      };
    } else if (tsb >= -30) {
      return {
        status: 'overreaching',
        description: 'You are significantly fatigued',
        recommendation: 'Consider reducing training volume and adding recovery days',
      };
    } else {
      return {
        status: 'overtraining',
        description: 'You are at risk of overtraining',
        recommendation: 'IMPORTANT: Take 3-5 days of complete rest or very easy recovery',
      };
    }
  },

  /**
   * Store daily metrics in database
   */
  async storeMetrics(athleteId: string, date: Date, metrics: TrainingLoad) {
    try {
      await supabaseAdmin
        .from('athlete_metrics')
        .upsert({
          athlete_id: athleteId,
          date: date.toISOString().split('T')[0], // Date only
          ctl: metrics.ctl,
          atl: metrics.atl,
          tsb: metrics.tsb,
        }, {
          onConflict: 'athlete_id,date',
        });
    } catch (error) {
      logger.error('Error storing metrics:', error);
    }
  },

  /**
   * Get complete training status for athlete
   */
  async getTrainingStatus(athleteId: string) {
    try {
      // Update TSS first
      await this.updateActivityTSS(athleteId);

      // Calculate current training load
      const load = await this.calculateTrainingLoad(athleteId);

      if (!load) {
        return {
          ctl: 0,
          atl: 0,
          tsb: 0,
          form_status: 'No training data available',
          last_updated: new Date().toISOString(),
        };
      }

      // Store metrics
      await this.storeMetrics(athleteId, new Date(), load);

      // Get training status
      const status = this.determineStatus(load.tsb);

      return {
        ctl: load.ctl,
        atl: load.atl,
        tsb: load.tsb,
        form_status: status.description,
        last_updated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting training status:', error);
      return null;
    }
  },

  /**
   * Recalculate TSS for ALL activities using Normalized Power from raw_data.
   * One-time historical fix to update activities that were calculated with avg power only.
   */
  async recalculateAllTSS(athleteId: string): Promise<{ updated: number; total: number }> {
    // Get athlete FTP
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp')
      .eq('id', athleteId)
      .single();

    if (!athlete?.ftp) {
      logger.debug('No FTP set for athlete, cannot recalculate TSS');
      return { updated: 0, total: 0 };
    }

    // Get all activities with power data
    const { data: activities } = await supabaseAdmin
      .from('strava_activities')
      .select('id, average_watts, moving_time_seconds, raw_data, tss')
      .eq('athlete_id', athleteId)
      .not('average_watts', 'is', null);

    if (!activities || activities.length === 0) {
      return { updated: 0, total: 0 };
    }

    let updated = 0;
    for (const activity of activities) {
      const normalizedPower = activity.raw_data?.weighted_average_watts || undefined;
      const newTSS = this.calculateTSS(
        activity.moving_time_seconds,
        activity.average_watts!,
        athlete.ftp,
        normalizedPower
      );

      if (newTSS !== activity.tss) {
        await supabaseAdmin
          .from('strava_activities')
          .update({ tss: newTSS })
          .eq('id', activity.id);
        updated++;
      }
    }

    logger.debug(`Recalculated TSS for ${updated}/${activities.length} activities`);
    return { updated, total: activities.length };
  },

  /**
   * Get historical metrics for charting
   */
  async getMetricsHistory(athleteId: string, days: number = 90) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: metrics } = await supabaseAdmin
        .from('athlete_metrics')
        .select('date, ctl, atl, tsb')
        .eq('athlete_id', athleteId)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

      return metrics;
    } catch (error) {
      logger.error('Error getting metrics history:', error);
      return null;
    }
  },
};
