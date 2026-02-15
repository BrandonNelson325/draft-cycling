import { supabaseAdmin } from '../utils/supabase';

export const ftpEstimationService = {
  /**
   * Estimate FTP from power curve data (last 6 weeks)
   * Method: Use 95% of best 20-minute power
   */
  async estimateFTP(athleteId: string): Promise<{
    estimated_ftp: number;
    confidence: 'high' | 'medium' | 'low';
    based_on: string;
    best_20min_power: number;
    activity_count: number;
  } | null> {
    try {
      // Get power curves from last 6 weeks
      const sixWeeksAgo = new Date();
      sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);

      const { data: curves, error } = await supabaseAdmin
        .from('power_curves')
        .select('*, strava_activities!inner(start_date)')
        .eq('athlete_id', athleteId)
        .gte('strava_activities.start_date', sixWeeksAgo.toISOString())
        .not('power_20min', 'is', null);

      if (error || !curves || curves.length === 0) {
        console.log('No power curve data available for FTP estimation');
        return null;
      }

      // Find best 20-minute power
      let best20Min = 0;
      for (const curve of curves) {
        if (curve.power_20min && curve.power_20min > best20Min) {
          best20Min = curve.power_20min;
        }
      }

      if (best20Min === 0) {
        return null;
      }

      // Calculate FTP as 95% of 20-minute power
      const estimatedFTP = Math.round(best20Min * 0.95);

      // Determine confidence based on data quality
      let confidence: 'high' | 'medium' | 'low' = 'low';
      if (curves.length >= 10) {
        confidence = 'high';
      } else if (curves.length >= 5) {
        confidence = 'medium';
      }

      return {
        estimated_ftp: estimatedFTP,
        confidence,
        based_on: `Best 20-min power from ${curves.length} rides in last 6 weeks`,
        best_20min_power: best20Min,
        activity_count: curves.length,
      };
    } catch (error) {
      console.error('Error estimating FTP:', error);
      return null;
    }
  },

  /**
   * Auto-update athlete FTP if estimation is high confidence
   */
  async autoUpdateFTP(athleteId: string): Promise<boolean> {
    try {
      const estimation = await this.estimateFTP(athleteId);

      if (!estimation) {
        return false;
      }

      // Only auto-update if high confidence
      if (estimation.confidence !== 'high') {
        console.log(`FTP estimation confidence too low (${estimation.confidence})`);
        return false;
      }

      // Get current FTP
      const { data: athlete } = await supabaseAdmin
        .from('athletes')
        .select('ftp')
        .eq('id', athleteId)
        .single();

      // Only update if significantly different (>5W difference) or not set
      if (
        !athlete?.ftp ||
        Math.abs(athlete.ftp - estimation.estimated_ftp) > 5
      ) {
        await supabaseAdmin
          .from('athletes')
          .update({
            ftp: estimation.estimated_ftp,
            updated_at: new Date().toISOString(),
          })
          .eq('id', athleteId);

        console.log(
          `Auto-updated FTP for athlete ${athleteId}: ${athlete?.ftp || 'none'} -> ${estimation.estimated_ftp}W`
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error auto-updating FTP:', error);
      return false;
    }
  },

  /**
   * Get FTP history and trends
   */
  async getFTPHistory(athleteId: string, weeks: number = 12) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);

      // Get power curves grouped by week
      const { data: curves, error } = await supabaseAdmin
        .from('power_curves')
        .select('power_20min, created_at')
        .eq('athlete_id', athleteId)
        .gte('created_at', startDate.toISOString())
        .not('power_20min', 'is', null)
        .order('created_at', { ascending: true });

      if (error || !curves || curves.length === 0) {
        return null;
      }

      // Group by week and calculate weekly best
      const weeklyBest: { week: string; ftp: number; power_20min: number }[] = [];
      const weekMap = new Map<string, number>();

      for (const curve of curves) {
        const week = this.getWeekKey(new Date(curve.created_at));
        const current = weekMap.get(week) || 0;
        if (curve.power_20min > current) {
          weekMap.set(week, curve.power_20min);
        }
      }

      for (const [week, power20] of weekMap.entries()) {
        weeklyBest.push({
          week,
          power_20min: power20,
          ftp: Math.round(power20 * 0.95),
        });
      }

      return weeklyBest.sort((a, b) => a.week.localeCompare(b.week));
    } catch (error) {
      console.error('Error getting FTP history:', error);
      return null;
    }
  },

  getWeekKey(date: Date): string {
    // Get ISO week year and week number
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  },

  getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  },
};
