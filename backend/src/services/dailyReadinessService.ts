import { supabaseAdmin } from '../utils/supabase';
import { calendarService } from './calendarService';

export interface DailyReadiness {
  date: string;
  hasCheckedInToday: boolean;
  todaysWorkout: any | null;
  recentActivity: {
    last7DaysTSS: number;
    last7DaysRides: number;
    yesterdayWorkout: any | null;
    lastRideDate: string | null;
    lastRideTSS: number | null;
  };
  readinessScore: number; // 1-10
  recommendation: 'rest' | 'light' | 'proceed' | 'push';
  reasoning: string;
}

export const dailyReadinessService = {
  /**
   * Get comprehensive daily readiness for an athlete
   */
  async getDailyReadiness(athleteId: string, localDate?: string): Promise<DailyReadiness> {
    const today = localDate || new Date().toISOString().split('T')[0];

    // Check if already checked in today
    const { data: todayMetrics } = await supabaseAdmin
      .from('daily_metrics')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('date', today)
      .single();

    const hasCheckedInToday = !!todayMetrics?.check_in_completed;

    // Get today's scheduled workout
    const todaysWorkout = await this.getTodaysWorkout(athleteId);

    // Get recent activity (last 7 days)
    const recentActivity = await this.getRecentActivity(athleteId);

    // Calculate readiness score
    const readinessAnalysis = this.calculateReadiness(
      recentActivity,
      todayMetrics
    );

    return {
      date: today,
      hasCheckedInToday,
      todaysWorkout,
      recentActivity,
      ...readinessAnalysis,
    };
  },

  /**
   * Get today's planned workout from calendar
   */
  async getTodaysWorkout(athleteId: string): Promise<any | null> {
    const today = new Date().toISOString().split('T')[0];

    const { data: calendarEntry } = await supabaseAdmin
      .from('calendar')
      .select('*, workout:workouts(*)')
      .eq('athlete_id', athleteId)
      .eq('date', today)
      .single();

    if (!calendarEntry || !calendarEntry.workout) {
      return null;
    }

    return {
      id: calendarEntry.workout.id,
      name: calendarEntry.workout.name,
      workout_type: calendarEntry.workout.workout_type,
      duration_minutes: calendarEntry.workout.duration_minutes,
      tss: calendarEntry.workout.tss,
      description: calendarEntry.workout.description,
    };
  },

  /**
   * Get recent training activity (last 7 days)
   */
  async getRecentActivity(athleteId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    // Get strava activities from last 7 days
    const { data: activities } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('start_date_local', sevenDaysAgoStr)
      .order('start_date_local', { ascending: false });

    const rides = activities || [];
    const totalTSS = rides.reduce((sum, ride) => sum + (ride.tss || 0), 0);

    // Get yesterday's workout
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const yesterdayRide = rides.find(
      (r) => r.start_date_local?.startsWith(yesterdayStr)
    );

    // Get most recent ride
    const lastRide = rides[0];

    return {
      last7DaysTSS: totalTSS,
      last7DaysRides: rides.length,
      yesterdayWorkout: yesterdayRide
        ? {
            name: yesterdayRide.name,
            tss: yesterdayRide.tss,
            duration_minutes: Math.round(yesterdayRide.moving_time / 60),
            average_watts: yesterdayRide.average_watts,
          }
        : null,
      lastRideDate: lastRide ? lastRide.start_date_local.split('T')[0] : null,
      lastRideTSS: lastRide ? lastRide.tss : null,
    };
  },

  /**
   * Calculate readiness score and recommendation
   */
  calculateReadiness(
    recentActivity: any,
    metrics: any
  ): {
    readinessScore: number;
    recommendation: 'rest' | 'light' | 'proceed' | 'push';
    reasoning: string;
  } {
    let readinessScore = 7; // Default: normal readiness
    let reasoning = '';

    // Factor 1: Sleep quality (if available)
    if (metrics?.sleep_score) {
      readinessScore += (metrics.sleep_score - 7) * 0.5; // Adjust +/- based on sleep
      if (metrics.sleep_score <= 3) {
        reasoning += 'Poor sleep last night. ';
      } else if (metrics.sleep_score >= 9) {
        reasoning += 'Great sleep last night! ';
      }
    }

    // Factor 2: Feeling (if available)
    if (metrics?.feeling_score) {
      readinessScore += (metrics.feeling_score - 7) * 0.5;
      if (metrics.feeling_score <= 3) {
        reasoning += 'Feeling tired today. ';
      } else if (metrics.feeling_score >= 9) {
        reasoning += 'Feeling energized! ';
      }
    }

    // Factor 3: Recent training load
    const avgDailyTSS = recentActivity.last7DaysTSS / 7;
    if (avgDailyTSS > 100) {
      readinessScore -= 1.5;
      reasoning += `High training load recently (${Math.round(avgDailyTSS)} TSS/day). `;
    } else if (avgDailyTSS < 40 && recentActivity.last7DaysRides > 0) {
      readinessScore += 1;
      reasoning += 'Light training load recently. ';
    }

    // Factor 4: Yesterday's workout
    if (recentActivity.yesterdayWorkout) {
      if (recentActivity.yesterdayWorkout.tss > 150) {
        readinessScore -= 1;
        reasoning += 'Big effort yesterday. ';
      }
    }

    // Factor 5: Days since last ride
    if (recentActivity.lastRideDate) {
      const daysSinceRide = Math.floor(
        (new Date().getTime() - new Date(recentActivity.lastRideDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      if (daysSinceRide >= 3) {
        readinessScore += 1;
        reasoning += `Well rested (${daysSinceRide} days since last ride). `;
      }
    }

    // Cap score between 1-10
    readinessScore = Math.max(1, Math.min(10, readinessScore));

    // Determine recommendation
    let recommendation: 'rest' | 'light' | 'proceed' | 'push';
    if (readinessScore >= 8.5) {
      recommendation = 'push';
      reasoning += 'Ready for a challenging workout!';
    } else if (readinessScore >= 6.5) {
      recommendation = 'proceed';
      reasoning += 'Good to proceed with planned workout.';
    } else if (readinessScore >= 4) {
      recommendation = 'light';
      reasoning += 'Consider a lighter workout or recovery ride.';
    } else {
      recommendation = 'rest';
      reasoning += 'Take a rest day to recover.';
    }

    return {
      readinessScore: Math.round(readinessScore * 10) / 10,
      recommendation,
      reasoning: reasoning.trim(),
    };
  },

  /**
   * Save daily check-in data
   */
  async saveDailyCheckIn(
    athleteId: string,
    data: {
      sleepQuality: 'poor' | 'good' | 'great';
      feeling: 'tired' | 'normal' | 'energized';
      notes?: string;
    },
    localDate?: string
  ): Promise<void> {
    const today = localDate || new Date().toISOString().split('T')[0];

    // Convert quality to scores
    const sleepScoreMap = { poor: 3, good: 7, great: 10 };
    const feelingScoreMap = { tired: 3, normal: 7, energized: 10 };

    const sleep_score = sleepScoreMap[data.sleepQuality];
    const feeling_score = feelingScoreMap[data.feeling];

    // Get recent activity for training load calculation
    const recentActivity = await this.getRecentActivity(athleteId);

    // Upsert daily metrics
    const { error } = await supabaseAdmin.from('daily_metrics').upsert(
      {
        athlete_id: athleteId,
        date: today,
        sleep_quality: data.sleepQuality,
        sleep_score,
        feeling: data.feeling,
        feeling_score,
        notes: data.notes || null,
        check_in_completed: true,
        check_in_at: new Date().toISOString(),
        training_load_last_7_days: recentActivity.last7DaysTSS,
      },
      {
        onConflict: 'athlete_id,date',
      }
    );

    if (error) {
      throw new Error(`Failed to save daily check-in: ${error.message}`);
    }
  },

  /**
   * Get today's metrics (if checked in)
   */
  async getTodayMetrics(athleteId: string, localDate?: string) {
    const today = localDate || new Date().toISOString().split('T')[0];

    const { data } = await supabaseAdmin
      .from('daily_metrics')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('date', today)
      .single();

    return data;
  },
};
