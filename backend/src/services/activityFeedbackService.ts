import { supabaseAdmin } from '../utils/supabase';

export interface UnacknowledgedActivity {
  id: string;
  name: string;
  start_date: string;
  distance_meters: number | null;
  moving_time_seconds: number | null;
  average_watts: number | null;
  tss: number | null;
  average_heartrate: number | null;
}

export interface ActivityFeedback {
  perceived_effort?: number;
  notes?: string;
}

export const activityFeedbackService = {
  async getUnacknowledgedActivities(athleteId: string): Promise<UnacknowledgedActivity[]> {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const { data, error } = await supabaseAdmin
      .from('strava_activities')
      .select('id, name, start_date, distance_meters, moving_time_seconds, average_watts, tss, raw_data')
      .eq('athlete_id', athleteId)
      .is('acknowledged_at', null)
      .gte('start_date', fourteenDaysAgo.toISOString())
      .order('start_date', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch unacknowledged activities: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      start_date: row.start_date,
      distance_meters: row.distance_meters,
      moving_time_seconds: row.moving_time_seconds,
      average_watts: row.average_watts,
      tss: row.tss,
      average_heartrate: row.raw_data?.average_heartrate ?? null,
    }));
  },

  async acknowledgeActivity(
    athleteId: string,
    activityId: string,
    feedback: ActivityFeedback
  ): Promise<void> {
    // Validate ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('strava_activities')
      .select('id')
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
  },
};
