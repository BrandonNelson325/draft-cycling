import { supabaseAdmin } from '../utils/supabase';
import { utcToLocalDate, mondayOfWeek } from '../utils/timezone';

interface WeeklyData {
  week_start: string;
  total_distance_meters: number;
  total_tss: number;
  total_time_seconds: number;
  ride_count: number;
}

interface DailyFitnessData {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
}

export const weeklyMetricsService = {
  async getWeeklyData(athleteId: string, weeks: number = 6, tz: string = 'America/Los_Angeles'): Promise<WeeklyData[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (weeks * 7));

    const { data, error } = await supabaseAdmin
      .from('strava_activities')
      .select('start_date, distance_meters, moving_time_seconds, tss')
      .eq('athlete_id', athleteId)
      .gte('start_date', startDate.toISOString())
      .order('start_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch weekly data: ${error.message}`);
    }

    // Group by week using athlete's local timezone
    const weeklyMap = new Map<string, WeeklyData>();

    data.forEach((activity: any) => {
      const localDate = utcToLocalDate(activity.start_date, tz);
      const weekKey = mondayOfWeek(localDate);

      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, {
          week_start: weekKey,
          total_distance_meters: 0,
          total_tss: 0,
          total_time_seconds: 0,
          ride_count: 0,
        });
      }

      const week = weeklyMap.get(weekKey)!;
      week.total_distance_meters += activity.distance_meters || 0;
      week.total_time_seconds += activity.moving_time_seconds || 0;
      week.ride_count += 1;

      // Use stored TSS (already calculated with NP when available)
      week.total_tss += activity.tss || 0;
    });

    return Array.from(weeklyMap.values()).sort((a, b) =>
      a.week_start.localeCompare(b.week_start)
    );
  },

  /**
   * Daily CTL/ATL/TSB series for the last `days` days, computed on the fly from
   * activity TSS. There is NO persisted daily-metrics table (the old
   * `training_status_history` read here never existed and always 500'd; the
   * `athlete_metrics` table is defined in migration 001 but nothing populates
   * it). So we replicate trainingLoadService.calculateTrainingLoad's per-day EMA
   * here: warm up over 180 days (so the 42-day CTL EMA converges before the
   * visible window starts at a realistic value, not 0), then emit one point per
   * day for the requested window. Returns [] on error/no data so the UI shows a
   * friendly "not enough history" state rather than an error.
   */
  async getFitnessTimeSeries(athleteId: string, days: number = 42): Promise<DailyFitnessData[]> {
    try {
      const CTL_TAU = 42;
      const ATL_TAU = 7;
      const WARMUP_DAYS = 180;

      const target = new Date();
      target.setUTCHours(0, 0, 0, 0);
      const windowStart = new Date(target);
      windowStart.setDate(windowStart.getDate() - (days - 1));
      const fetchStart = new Date(windowStart);
      fetchStart.setDate(fetchStart.getDate() - WARMUP_DAYS);

      const { data: activities, error } = await supabaseAdmin
        .from('strava_activities')
        .select('start_date, tss')
        .eq('athlete_id', athleteId)
        .gte('start_date', fetchStart.toISOString())
        .lte('start_date', new Date().toISOString())
        .not('tss', 'is', null)
        .order('start_date', { ascending: true });

      if (error) throw new Error(error.message);
      if (!activities || activities.length === 0) return [];

      // Sum TSS per calendar day (multiple rides collapse into one day).
      const dailyTSS = new Map<string, number>();
      for (const a of activities) {
        const dayKey = new Date(a.start_date).toISOString().split('T')[0];
        dailyTSS.set(dayKey, (dailyTSS.get(dayKey) || 0) + (a.tss || 0));
      }

      let ctl = 0;
      let atl = 0;
      const series: DailyFitnessData[] = [];
      const current = new Date(fetchStart);
      current.setUTCHours(0, 0, 0, 0);

      while (current <= target) {
        const dayKey = current.toISOString().split('T')[0];
        const tss = dailyTSS.get(dayKey) || 0;
        ctl = ctl + (tss - ctl) / CTL_TAU;
        atl = atl + (tss - atl) / ATL_TAU;
        if (current >= windowStart) {
          series.push({
            date: dayKey,
            ctl: Math.round(ctl * 10) / 10,
            atl: Math.round(atl * 10) / 10,
            tsb: Math.round((ctl - atl) * 10) / 10,
          });
        }
        current.setDate(current.getDate() + 1);
      }

      return series;
    } catch (err) {
      console.error('Failed to build fitness time series:', err);
      return [];
    }
  },

  async getPowerZoneDistribution(athleteId: string, days: number = 30) {
    // Get activities with power data
    const { data: activities } = await supabaseAdmin
      .from('strava_activities')
      .select('start_date, moving_time_seconds, average_watts')
      .eq('athlete_id', athleteId)
      .gte('start_date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .not('average_watts', 'is', null);

    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp')
      .eq('id', athleteId)
      .single();

    const ftp = athlete?.ftp || 200;

    // Initialize zones
    const zones = {
      Z1: 0, // < 55% FTP (Recovery)
      Z2: 0, // 55-75% (Endurance)
      Z3: 0, // 75-90% (Tempo)
      Z4: 0, // 90-105% (Threshold)
      Z5: 0, // 105-120% (VO2max)
      Z6: 0, // > 120% (Anaerobic)
    };

    activities?.forEach((activity: any) => {
      const powerPercent = (activity.average_watts / ftp) * 100;
      const time = activity.moving_time_seconds / 60; // Convert to minutes

      if (powerPercent < 55) zones.Z1 += time;
      else if (powerPercent < 75) zones.Z2 += time;
      else if (powerPercent < 90) zones.Z3 += time;
      else if (powerPercent < 105) zones.Z4 += time;
      else if (powerPercent < 120) zones.Z5 += time;
      else zones.Z6 += time;
    });

    return Object.entries(zones).map(([zone, minutes]) => ({
      zone,
      minutes: Math.round(minutes),
      hours: (minutes / 60).toFixed(1),
    }));
  },
};
