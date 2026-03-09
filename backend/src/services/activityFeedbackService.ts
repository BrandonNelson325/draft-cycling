import { supabaseAdmin } from '../utils/supabase';
import { activityMatchingService, type PlannedWorkoutInfo } from './activityMatchingService';

export interface UnacknowledgedActivity {
  id: string;
  name: string;
  start_date: string;
  strava_activity_id: number;
  distance_meters: number | null;
  moving_time_seconds: number | null;
  average_watts: number | null;
  tss: number | null;
  average_heartrate: number | null;
  calories: number | null;
  plannedWorkout: PlannedWorkoutInfo | null;
  matchConfidence: 'high' | 'partial' | 'low' | null;
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
      .select('id, strava_activity_id, name, start_date, distance_meters, moving_time_seconds, average_watts, tss, raw_data')
      .eq('athlete_id', athleteId)
      .is('acknowledged_at', null)
      .gte('start_date', fourteenDaysAgo.toISOString())
      .order('start_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch unacknowledged activities: ${error.message}`);
    }

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

        return {
          id: row.id,
          name: row.name,
          start_date: row.start_date,
          strava_activity_id: row.strava_activity_id,
          distance_meters: row.distance_meters,
          moving_time_seconds: row.moving_time_seconds,
          average_watts: row.average_watts,
          tss: row.tss,
          average_heartrate: row.raw_data?.average_heartrate ?? null,
          calories: row.raw_data?.kilojoules ? Math.round(row.raw_data.kilojoules) : null,
          plannedWorkout,
          matchConfidence,
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
