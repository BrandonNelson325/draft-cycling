import { supabaseAdmin } from '../utils/supabase';
import { activityMatchingService, type PlannedWorkoutInfo } from './activityMatchingService';
import { powerAnalysisService } from './powerAnalysisService';
import type { IntervalAnalysis } from './intervalAnalysisService';

export interface UnacknowledgedActivity {
  id: string;
  name: string;
  start_date: string;
  strava_activity_id: number;
  distance_meters: number | null;
  moving_time_seconds: number | null;
  average_watts: number | null;
  normalized_power: number | null;
  intensity_factor: number | null; // NP / FTP, rounded to 2dp
  best_5min_power: number | null;
  best_20min_power: number | null;
  tss: number | null;
  average_heartrate: number | null;
  calories: number | null;
  plannedWorkout: PlannedWorkoutInfo | null;
  matchConfidence: 'high' | 'partial' | 'low' | null;
  intervalAnalysis: IntervalAnalysis | null;
}

export interface ActivityFeedback {
  perceived_effort?: number;
  notes?: string;
  was_planned_workout?: boolean; // true = confirm match, false = reject match
  calendar_entry_id?: string; // the matched calendar entry
}

export const activityFeedbackService = {
  async getUnacknowledgedActivities(athleteId: string): Promise<UnacknowledgedActivity[]> {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data, error } = await supabaseAdmin
      .from('strava_activities')
      .select('id, strava_activity_id, name, start_date, distance_meters, moving_time_seconds, average_watts, tss, raw_data, interval_analysis')
      .eq('athlete_id', athleteId)
      .is('acknowledged_at', null)
      .gte('start_date', fourteenDaysAgo.toISOString())
      .order('start_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch unacknowledged activities: ${error.message}`);
    }

    // FTP for intensity-factor math (so races/free rides get a summary too).
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp')
      .eq('id', athleteId)
      .single();
    const ftp = athlete?.ftp || 0;

    // For each activity, check if there's a planned workout for that day
    const activities = await Promise.all(
      (data || []).map(async (row) => {
        let plannedWorkout: PlannedWorkoutInfo | null = null;
        let matchConfidence: 'high' | 'partial' | 'low' | null = null;

        try {
          plannedWorkout = await activityMatchingService.getPlannedWorkoutForActivity(
            athleteId,
            row.start_date
          );

          if (plannedWorkout) {
            const match = activityMatchingService.scoreMatch(
              { tss: row.tss, moving_time_seconds: row.moving_time_seconds },
              { tss: plannedWorkout.plannedTSS, duration_minutes: plannedWorkout.plannedDuration }
            );
            matchConfidence = match.confidence;
          }
        } catch {
          // Non-fatal — just skip matching info
        }

        const np = row.raw_data?.weighted_average_watts ?? null;
        const intensityFactor = np && ftp ? Math.round((np / ftp) * 100) / 100 : null;

        // Best 5- and 20-min power for a ride summary highlight (races/free rides).
        let best5min: number | null = null;
        let best20min: number | null = null;
        try {
          const curve = await powerAnalysisService.getActivityPowerCurve(athleteId, row.strava_activity_id);
          if (curve) {
            best5min = curve.power_5min ?? null;
            best20min = curve.power_20min ?? null;
          }
        } catch {
          // No power curve for this ride — fine, highlights just stay null.
        }

        return {
          id: row.id,
          name: row.name,
          start_date: row.start_date,
          strava_activity_id: row.strava_activity_id,
          distance_meters: row.distance_meters,
          moving_time_seconds: row.moving_time_seconds,
          average_watts: row.average_watts,
          normalized_power: np,
          intensity_factor: intensityFactor,
          best_5min_power: best5min,
          best_20min_power: best20min,
          tss: row.tss,
          average_heartrate: row.raw_data?.average_heartrate ?? null,
          calories: row.raw_data?.kilojoules ? Math.round(row.raw_data.kilojoules) : null,
          plannedWorkout,
          matchConfidence,
          intervalAnalysis: (row.interval_analysis as IntervalAnalysis | null) ?? null,
        };
      })
    );

    return activities;
  },

  async acknowledgeActivity(
    athleteId: string,
    activityId: string,
    feedback: ActivityFeedback
  ): Promise<void> {
    // Validate ownership and get strava_activity_id
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('strava_activities')
      .select('id, strava_activity_id')
      .eq('id', activityId)
      .eq('athlete_id', athleteId)
      .single();

    if (fetchError || !existing) {
      throw new Error('Activity not found or access denied');
    }

    const updateData: Record<string, unknown> = {
      acknowledged_at: new Date().toISOString(),
    };

    if (feedback.perceived_effort !== undefined) {
      updateData.perceived_effort = feedback.perceived_effort;
    }

    if (feedback.notes !== undefined) {
      updateData.post_activity_notes = feedback.notes;
    }

    const { error } = await supabaseAdmin
      .from('strava_activities')
      .update(updateData)
      .eq('id', activityId)
      .eq('athlete_id', athleteId);

    if (error) {
      throw new Error(`Failed to acknowledge activity: ${error.message}`);
    }

    // Handle workout matching
    if (feedback.calendar_entry_id) {
      if (feedback.was_planned_workout === true) {
        await activityMatchingService.confirmMatch(
          athleteId,
          feedback.calendar_entry_id,
          existing.strava_activity_id
        );
      } else if (feedback.was_planned_workout === false) {
        await activityMatchingService.rejectMatch(
          athleteId,
          feedback.calendar_entry_id
        );
      }
    }
  },
};
