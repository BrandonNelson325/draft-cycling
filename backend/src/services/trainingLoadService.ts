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
   * Uses 180-day lookback so the 42-day CTL EMA fully converges (~3 time constants).
   */
  async calculateTrainingLoad(athleteId: string, date: Date = new Date()): Promise<TrainingLoad | null> {
    try {
      // 180-day lookback: 42-day EMA needs ~126 days (3×τ) to reach 95% convergence
      const lookbackDays = 180;
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
   * Determine training status using Acute:Chronic Workload Ratio (ACWR).
   *
   * ACWR = ATL / CTL — the standard sports-science metric used by coaches,
   * TrainingPeaks, and research literature. It automatically scales to
   * individual fitness: a TSB of -25 means very different things for
   * CTL 80 (ACWR ~1.3, productive) vs CTL 30 (ACWR ~1.8, danger).
   *
   * Thresholds (from Gabbett 2016, Hulin et al. 2014):
   *   ACWR < 0.8  → Detraining / very fresh
   *   0.8–1.0     → Maintaining / balanced
   *   1.0–1.3     → Productive sweet spot (building fitness)
   *   1.3–1.5     → Functional overreaching (plan recovery)
   *   > 1.5       → Overtraining risk
   *
   * For new athletes (CTL < 15), we use simplified messaging since
   * the ratio is unreliable with a tiny denominator.
   */
  determineStatus(ctl: number, atl: number, tsb: number): TrainingStatus {
    // New athlete — not enough training history for meaningful ratios
    if (ctl < 15) {
      if (tsb > 10) {
        return {
          status: 'fresh',
          description: 'Ready to train — build your base consistently',
          recommendation: 'Focus on regular, moderate rides to build your training base',
        };
      } else if (tsb >= -10) {
        return {
          status: 'optimal',
          description: 'Good balance of training and recovery',
          recommendation: 'Keep building — consistency is more important than intensity right now',
        };
      } else {
        return {
          status: 'productive',
          description: 'Building your training base — nice work',
          recommendation: 'Make sure to take easy days between hard efforts as you build fitness',
        };
      }
    }

    const acwr = atl / ctl;

    if (acwr > 1.5) {
      return {
        status: 'overtraining',
        description: 'Training load is spiking — high injury/burnout risk',
        recommendation: 'Plan 2-3 easy/rest days. Ramp training gradually (< 10% weekly increase)',
      };
    } else if (acwr > 1.3) {
      return {
        status: 'overreaching',
        description: 'Heavy training block — functional overreaching',
        recommendation: 'Recovery day soon. This is fine short-term but don\'t sustain it for more than a week',
      };
    } else if (acwr > 1.0) {
      return {
        status: 'productive',
        description: 'In the sweet spot — building fitness effectively',
        recommendation: 'This is where gains happen. Continue training as planned, ensure good recovery between hard days',
      };
    } else if (acwr > 0.8) {
      return {
        status: 'optimal',
        description: 'Balanced training and recovery',
        recommendation: 'Good maintenance zone. Ready for harder efforts if you want to push',
      };
    } else if (ctl > 40 && acwr < 0.5) {
      return {
        status: 'fresh',
        description: 'Extended rest — fitness may start to fade',
        recommendation: 'Time to get back to structured training before losing gains',
      };
    } else {
      return {
        status: 'fresh',
        description: 'Well-rested and ready for hard efforts',
        recommendation: 'Good time for high-intensity training, races, or FTP tests',
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

      // Get training status using ACWR (relative to individual fitness)
      const status = this.determineStatus(load.ctl, load.atl, load.tsb);

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
