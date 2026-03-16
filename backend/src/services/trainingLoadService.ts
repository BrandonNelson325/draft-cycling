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

interface StatusContext {
  experienceLevel?: 'beginner' | 'intermediate' | 'advanced' | null;
  recentRPE?: { avgRPE: number; count: number } | null;
  readiness?: { sleepScore: number; feelingScore: number } | null;
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
  determineStatus(ctl: number, atl: number, tsb: number, context?: StatusContext): TrainingStatus {
    const experienceLevel = context?.experienceLevel || 'intermediate';

    // Determine CTL threshold for "new/low-volume" athlete
    // Advanced riders returning from low volume shouldn't be flagged by unreliable ACWR
    const lowCTLThreshold = experienceLevel === 'advanced' ? 40
                          : experienceLevel === 'intermediate' ? 25
                          : 15;

    // Low-volume path: use TSB-based logic (ACWR unreliable with small denominator)
    if (ctl < lowCTLThreshold) {
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

    // ACWR-based status with experience-adjusted thresholds
    const acwr = atl / ctl;

    const thresholds = {
      overtraining: experienceLevel === 'advanced' ? 1.75 : experienceLevel === 'beginner' ? 1.4 : 1.5,
      overreaching: experienceLevel === 'advanced' ? 1.5 : experienceLevel === 'beginner' ? 1.2 : 1.3,
    };

    let result: TrainingStatus;

    if (acwr > thresholds.overtraining) {
      result = {
        status: 'overtraining',
        description: 'Training load is spiking — high injury/burnout risk',
        recommendation: 'Plan 2-3 easy/rest days. Ramp training gradually (< 10% weekly increase)',
      };
    } else if (acwr > thresholds.overreaching) {
      result = {
        status: 'overreaching',
        description: 'Heavy training block — functional overreaching',
        recommendation: 'Recovery day soon. This is fine short-term but don\'t sustain it for more than a week',
      };
    } else if (acwr > 1.0) {
      result = {
        status: 'productive',
        description: 'In the sweet spot — building fitness effectively',
        recommendation: 'This is where gains happen. Continue training as planned, ensure good recovery between hard days',
      };
    } else if (acwr > 0.8) {
      result = {
        status: 'optimal',
        description: 'Balanced training and recovery',
        recommendation: 'Good maintenance zone. Ready for harder efforts if you want to push',
      };
    } else if (ctl > 40 && acwr < 0.5) {
      result = {
        status: 'fresh',
        description: 'Extended rest — fitness may start to fade',
        recommendation: 'Time to get back to structured training before losing gains',
      };
    } else {
      result = {
        status: 'fresh',
        description: 'Well-rested and ready for hard efforts',
        recommendation: 'Good time for high-intensity training, races, or FTP tests',
      };
    }

    // RPE override: subjective feedback trumps pure math
    if (context?.recentRPE && context.recentRPE.count >= 3) {
      const { avgRPE } = context.recentRPE;

      if (avgRPE <= 2.5 && (result.status === 'overtraining' || result.status === 'overreaching')) {
        // Athlete handling it well — downgrade severity
        if (result.status === 'overtraining') {
          result = {
            status: 'overreaching',
            description: 'Training load is elevated but you\'re responding well',
            recommendation: 'Keep monitoring how you feel. A recovery day this week would be smart insurance',
          };
        } else {
          result = {
            status: 'productive',
            description: 'Heavy week but you\'re handling it well based on your feedback',
            recommendation: 'Your body is adapting. Continue as planned but don\'t ignore early signs of fatigue',
          };
        }
      } else if (avgRPE >= 4.0 && (result.status === 'productive' || result.status === 'optimal')) {
        // Athlete struggling more than numbers suggest — upgrade severity
        if (result.status === 'productive') {
          result = {
            status: 'overreaching',
            description: 'Your effort ratings suggest you\'re working harder than the numbers show',
            recommendation: 'Consider an extra recovery day. High perceived effort with moderate load can signal accumulated fatigue',
          };
        } else {
          result = {
            status: 'productive',
            description: 'Training load is moderate but your effort ratings are running high',
            recommendation: 'Pay attention to recovery quality. If this trend continues, scale back intensity',
          };
        }
      }
    }

    // Readiness modifier: sleep + feeling check-in
    if (context?.readiness) {
      const { sleepScore, feelingScore } = context.readiness;

      if (sleepScore >= 7 && feelingScore >= 7 && result.status === 'overreaching') {
        result = {
          status: 'productive',
          description: result.description + ' — well-rested so this load is manageable',
          recommendation: 'You\'re sleeping well and feeling good. Your body can handle this training block',
        };
      } else if (sleepScore <= 4 && feelingScore <= 4 && result.status === 'productive') {
        result = {
          status: 'overreaching',
          description: result.description + ' — poor sleep and fatigue suggest more recovery needed',
          recommendation: 'Despite moderate training load, your body signals need rest. Prioritize sleep and consider an easy day',
        };
      }
    }

    return result;
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

      // Fetch context for smarter status determination
      const [athleteResult, rpeResult, checkInResult] = await Promise.all([
        supabaseAdmin
          .from('athletes')
          .select('experience_level')
          .eq('id', athleteId)
          .single(),
        supabaseAdmin
          .from('strava_activities')
          .select('perceived_effort')
          .eq('athlete_id', athleteId)
          .not('perceived_effort', 'is', null)
          .order('start_date', { ascending: false })
          .limit(10),
        supabaseAdmin
          .from('daily_metrics')
          .select('sleep_score, feeling_score')
          .eq('athlete_id', athleteId)
          .order('date', { ascending: false })
          .limit(1),
      ]);

      const experienceLevel = athleteResult.data?.experience_level || null;

      const rpeData = rpeResult.data;
      const recentRPE = rpeData && rpeData.length >= 3
        ? { avgRPE: rpeData.reduce((sum: number, r: any) => sum + r.perceived_effort, 0) / rpeData.length, count: rpeData.length }
        : null;

      const checkIn = checkInResult.data?.[0];
      const readiness = checkIn?.sleep_score && checkIn?.feeling_score
        ? { sleepScore: checkIn.sleep_score, feelingScore: checkIn.feeling_score }
        : null;

      // Get training status using ACWR (relative to individual fitness) with context
      const status = this.determineStatus(load.ctl, load.atl, load.tsb, { experienceLevel, recentRPE, readiness });

      return {
        ctl: load.ctl,
        atl: load.atl,
        tsb: load.tsb,
        status: status.status,
        form_status: status.description,
        recommendation: status.recommendation,
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
