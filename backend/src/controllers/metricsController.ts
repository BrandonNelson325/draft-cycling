import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { weekStartInTimezone, monthStartInTimezone, localDayToUTCRange, todayInTimezone } from '../utils/timezone';

export const getMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const period = (req.query.period as string) || 'week'; // week, month, year, all

    // Fetch athlete timezone
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('timezone')
      .eq('id', req.user.id)
      .single();

    const tz = athlete?.timezone || 'America/Los_Angeles';

    let startDateISO: string;

    switch (period) {
      case 'week': {
        const mondayLocal = weekStartInTimezone(tz);
        const { start } = localDayToUTCRange(mondayLocal, tz);
        startDateISO = start;
        break;
      }
      case 'month': {
        const monthStart = monthStartInTimezone(tz);
        const { start } = localDayToUTCRange(monthStart, tz);
        startDateISO = start;
        break;
      }
      case '8weeks': {
        const today = todayInTimezone(tz);
        const [y, m, d] = today.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        date.setUTCDate(date.getUTCDate() - 56);
        const dateStr = date.toISOString().split('T')[0];
        const { start } = localDayToUTCRange(dateStr, tz);
        startDateISO = start;
        break;
      }
      case 'year': {
        const today = todayInTimezone(tz);
        const [y, m, d] = today.split('-').map(Number);
        const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        date.setUTCDate(date.getUTCDate() - 365);
        const dateStr = date.toISOString().split('T')[0];
        const { start } = localDayToUTCRange(dateStr, tz);
        startDateISO = start;
        break;
      }
      case 'all':
        startDateISO = new Date(0).toISOString();
        break;
      default: {
        const mondayLocal = weekStartInTimezone(tz);
        const { start } = localDayToUTCRange(mondayLocal, tz);
        startDateISO = start;
      }
    }

    // Get activities in time period
    const { data: activities, error } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', req.user.id)
      .gte('start_date', startDateISO)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching metrics:', error);
      res.status(500).json({ error: 'Failed to fetch metrics' });
      return;
    }

    if (!activities || activities.length === 0) {
      console.warn(`[Metrics] No activities found for athlete ${req.user.id}, period=${period}, startDate=${startDateISO}, tz=${tz}`);
      res.json({
        period,
        total_distance_meters: 0,
        total_time_seconds: 0,
        total_elevation_meters: 0,
        total_tss: 0,
        total_calories: 0,
        ride_count: 0,
        avg_distance_meters: 0,
        avg_time_seconds: 0,
        power_prs: {
          power_5sec: 0,
          power_1min: 0,
          power_3min: 0,
          power_5min: 0,
          power_10min: 0,
          power_20min: 0,
        },
      });
      return;
    }

    // Calculate totals
    const totalDistance = activities.reduce((sum, a) => sum + (a.distance_meters || 0), 0);
    const totalTime = activities.reduce((sum, a) => sum + (a.moving_time_seconds || 0), 0);
    const totalElevation = activities.reduce((sum, a) => sum + ((a.raw_data?.total_elevation_gain || 0)), 0);
    const totalTSS = activities.reduce((sum, a) => sum + (a.tss || 0), 0);
    const totalCalories = activities.reduce((sum, a) => sum + (a.raw_data?.kilojoules ? Math.round(a.raw_data.kilojoules) : 0), 0);

    // Get power PRs from power_curves table
    const { data: powerCurves } = await supabaseAdmin
      .from('power_curves')
      .select('*')
      .eq('athlete_id', req.user.id)
      .gte('created_at', startDateISO)
      .order('power_5sec', { ascending: false })
      .limit(1);

    let powerPRs = {
      power_5sec: 0,
      power_1min: 0,
      power_3min: 0,
      power_5min: 0,
      power_10min: 0,
      power_20min: 0,
    };

    if (powerCurves && powerCurves.length > 0) {
      // Get best powers across all curves in period
      const { data: allCurves } = await supabaseAdmin
        .from('power_curves')
        .select('power_5sec, power_1min, power_3min, power_5min, power_10min, power_20min')
        .eq('athlete_id', req.user.id)
        .gte('created_at', startDateISO);

      if (allCurves) {
        powerPRs = {
          power_5sec: Math.max(...allCurves.map(c => c.power_5sec || 0)),
          power_1min: Math.max(...allCurves.map(c => c.power_1min || 0)),
          power_3min: Math.max(...allCurves.map(c => c.power_3min || 0)),
          power_5min: Math.max(...allCurves.map(c => c.power_5min || 0)),
          power_10min: Math.max(...allCurves.map(c => c.power_10min || 0)),
          power_20min: Math.max(...allCurves.map(c => c.power_20min || 0)),
        };
      }
    }

    res.json({
      period,
      total_distance_meters: totalDistance,
      total_time_seconds: totalTime,
      total_elevation_meters: Math.round(totalElevation),
      total_tss: Math.round(totalTSS * 10) / 10,
      total_calories: totalCalories,
      ride_count: activities.length,
      avg_distance_meters: Math.round(totalDistance / activities.length),
      avg_time_seconds: Math.round(totalTime / activities.length),
      power_prs: powerPRs,
    });
  } catch (error) {
    console.error('Get metrics error:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
};
