import { supabaseAdmin } from '../utils/supabase';

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
   * Simplified: TSS ≈ (hours * avg_power / FTP)^2 * 100
   */
  calculateTSS(durationSeconds: number, avgPower: number, ftp: number): number {
    if (!ftp || ftp === 0) {
      return 0;
    }

    const hours = durationSeconds / 3600;
    const intensityFactor = avgPower / ftp;
    const tss = hours * intensityFactor * intensityFactor * 100;

    return Math.round(tss);
  },

  /**
   * Update TSS for all activities that have power data
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
        console.log('No FTP set for athlete, cannot calculate TSS');
        return;
      }

      // Get activities without TSS that have power data
      const { data: activities } = await supabaseAdmin
        .from('strava_activities')
        .select('id, strava_activity_id, average_watts, moving_time_seconds')
        .eq('athlete_id', athleteId)
        .not('average_watts', 'is', null)
        .is('tss', null);

      if (!activities || activities.length === 0) {
        return;
      }

      // Calculate and update TSS
      for (const activity of activities) {
        const tss = this.calculateTSS(
          activity.moving_time_seconds,
          activity.average_watts!,
          athlete.ftp
        );

        await supabaseAdmin
          .from('strava_activities')
          .update({ tss })
          .eq('id', activity.id);
      }

      console.log(`Updated TSS for ${activities.length} activities`);
    } catch (error) {
      console.error('Error updating activity TSS:', error);
    }
  },

  /**
   * Calculate CTL, ATL, TSB for a given date
   */
  async calculateTrainingLoad(athleteId: string, date: Date = new Date()): Promise<TrainingLoad | null> {
    try {
      // Get activities for calculation window (last 42 days for CTL)
      const fortyTwoDaysAgo = new Date(date);
      fortyTwoDaysAgo.setDate(fortyTwoDaysAgo.getDate() - 42);

      const { data: activities } = await supabaseAdmin
        .from('strava_activities')
        .select('start_date, tss')
        .eq('athlete_id', athleteId)
        .gte('start_date', fortyTwoDaysAgo.toISOString())
        .lte('start_date', date.toISOString())
        .not('tss', 'is', null)
        .order('start_date', { ascending: true });

      if (!activities || activities.length === 0) {
        return null;
      }

      // Calculate exponential moving averages
      const ctlTimeConstant = 42;
      const atlTimeConstant = 7;

      let ctl = 0;
      let atl = 0;

      for (const activity of activities) {
        const tss = activity.tss || 0;

        // Exponential moving average formula:
        // EMA_today = EMA_yesterday + (TSS_today - EMA_yesterday) * (1 / time_constant)
        ctl = ctl + (tss - ctl) * (1 / ctlTimeConstant);
        atl = atl + (tss - atl) * (1 / atlTimeConstant);
      }

      const tsb = ctl - atl;

      return {
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        tsb: Math.round(tsb * 10) / 10,
      };
    } catch (error) {
      console.error('Error calculating training load:', error);
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
      console.error('Error storing metrics:', error);
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
          message: 'Not enough training data available',
          load: null,
          status: null,
        };
      }

      // Store metrics
      await this.storeMetrics(athleteId, new Date(), load);

      // Get training status
      const status = this.determineStatus(load.tsb);

      return {
        load,
        status,
      };
    } catch (error) {
      console.error('Error getting training status:', error);
      return null;
    }
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
      console.error('Error getting metrics history:', error);
      return null;
    }
  },
};
