import { supabaseAdmin } from '../utils/supabase';

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
  async getWeeklyData(athleteId: string, weeks: number = 6): Promise<WeeklyData[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (weeks * 7));

    const { data, error } = await supabaseAdmin
      .from('strava_activities')
      .select('start_date, distance_meters, moving_time_seconds, average_watts')
      .eq('athlete_id', athleteId)
      .gte('start_date', startDate.toISOString())
      .order('start_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch weekly data: ${error.message}`);
    }

    // Get athlete's FTP for TSS calculation
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp')
      .eq('id', athleteId)
      .single();

    const ftp = athlete?.ftp || 200;

    // Group by week
    const weeklyMap = new Map<string, WeeklyData>();

    data.forEach((activity: any) => {
      const date = new Date(activity.start_date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
      const weekKey = weekStart.toISOString().split('T')[0];

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

      // Calculate TSS (simplified)
      if (activity.average_watts && activity.moving_time_seconds) {
        const hours = activity.moving_time_seconds / 3600;
        const intensity = activity.average_watts / ftp;
        const tss = hours * intensity * intensity * 100;
        week.total_tss += tss;
      }
    });

    return Array.from(weeklyMap.values()).sort((a, b) =>
      a.week_start.localeCompare(b.week_start)
    );
  },

  async getFitnessTimeSeries(athleteId: string, days: number = 42): Promise<DailyFitnessData[]> {
    const { data, error } = await supabaseAdmin
      .from('training_status_history')
      .select('date, ctl, atl, tsb')
      .eq('athlete_id', athleteId)
      .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('date', { ascending: true })
      .limit(days);

    if (error) {
      throw new Error(`Failed to fetch fitness time series: ${error.message}`);
    }

    return data.map((row: any) => ({
      date: row.date,
      ctl: parseFloat(row.ctl) || 0,
      atl: parseFloat(row.atl) || 0,
      tsb: parseFloat(row.tsb) || 0,
    }));
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
