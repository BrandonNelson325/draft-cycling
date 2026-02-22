import { supabaseAdmin } from '../utils/supabase';
import { CalendarEntry, ScheduleWorkoutDTO, UpdateCalendarEntryDTO } from '../types/calendar';
import { intervalsIcuService } from './intervalsIcuService';
import { logger } from '../utils/logger';

export const calendarService = {
  /**
   * Schedule a workout to a specific date
   */
  async scheduleWorkout(
    athleteId: string,
    workoutId: string,
    scheduledDate: Date,
    aiRationale?: string,
    trainingPlanId?: string,
    weekNumber?: number
  ): Promise<CalendarEntry> {
    const dateStr = scheduledDate.toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .insert({
        athlete_id: athleteId,
        workout_id: workoutId,
        scheduled_date: dateStr,
        ai_rationale: aiRationale,
        training_plan_id: trainingPlanId,
        week_number: weekNumber,
        completed: false,
      })
      .select('*, workouts(*)')
      .single();

    if (error) {
      throw new Error(`Failed to schedule workout: ${error.message}`);
    }

    // Auto-sync to Intervals.icu if enabled
    try {
      const { data: athlete } = await supabaseAdmin
        .from('athletes')
        .select('intervals_icu_auto_sync')
        .eq('id', athleteId)
        .single();

      if (athlete?.intervals_icu_auto_sync) {
        // Sync in background (don't await - don't block the response)
        intervalsIcuService
          .uploadWorkout(athleteId, workoutId, scheduledDate, data.id)
          .then(() => {
            logger.debug(`✅ Auto-synced workout ${workoutId} to Intervals.icu`);
          })
          .catch((err) => {
            logger.error(`❌ Auto-sync to Intervals.icu failed:`, err.message);
          });
      }
    } catch (syncError) {
      // Log but don't fail the scheduling
      logger.error('Error checking auto-sync settings:', syncError);
    }

    return data as CalendarEntry;
  },

  /**
   * Get calendar entries for a date range
   */
  async getCalendarEntries(
    athleteId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarEntry[]> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .select('*, workouts(*)')
      .eq('athlete_id', athleteId)
      .gte('scheduled_date', startStr)
      .lte('scheduled_date', endStr)
      .order('scheduled_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch calendar entries: ${error.message}`);
    }

    return (data as CalendarEntry[]) || [];
  },

  /**
   * Move a workout to a different date
   */
  async moveWorkout(entryId: string, athleteId: string, newDate: Date): Promise<CalendarEntry> {
    const dateStr = newDate.toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .update({
        scheduled_date: dateStr,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('athlete_id', athleteId)
      .select('*, workouts(*)')
      .single();

    if (error) {
      throw new Error(`Failed to move workout: ${error.message}`);
    }

    return data as CalendarEntry;
  },

  /**
   * Update a calendar entry
   */
  async updateEntry(
    entryId: string,
    athleteId: string,
    updates: UpdateCalendarEntryDTO
  ): Promise<CalendarEntry> {
    // If scheduled_date is provided, ensure it's in the correct format
    const updateData: any = { ...updates };
    if (updates.scheduled_date) {
      const date = new Date(updates.scheduled_date);
      updateData.scheduled_date = date.toISOString().split('T')[0];
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .update(updateData)
      .eq('id', entryId)
      .eq('athlete_id', athleteId)
      .select('*, workouts(*)')
      .single();

    if (error) {
      throw new Error(`Failed to update calendar entry: ${error.message}`);
    }

    return data as CalendarEntry;
  },

  /**
   * Delete a calendar entry
   */
  async deleteEntry(entryId: string, athleteId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('calendar_entries')
      .delete()
      .eq('id', entryId)
      .eq('athlete_id', athleteId);

    if (error) {
      throw new Error(`Failed to delete calendar entry: ${error.message}`);
    }
  },

  /**
   * Mark a workout as completed
   */
  async completeWorkout(
    entryId: string,
    athleteId: string,
    notes?: string,
    stravaActivityId?: number
  ): Promise<CalendarEntry> {
    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
        notes,
        strava_activity_id: stravaActivityId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('athlete_id', athleteId)
      .select('*, workouts(*)')
      .single();

    if (error) {
      throw new Error(`Failed to complete workout: ${error.message}`);
    }

    return data as CalendarEntry;
  },

  /**
   * Get upcoming workouts
   */
  async getUpcomingWorkouts(athleteId: string, days: number = 7): Promise<CalendarEntry[]> {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    return this.getCalendarEntries(athleteId, startDate, endDate);
  },

  /**
   * Bulk schedule workouts (for training plans)
   */
  async bulkSchedule(
    athleteId: string,
    entries: { workout_id: string; scheduled_date: string; ai_rationale?: string }[]
  ): Promise<CalendarEntry[]> {
    const insertData = entries.map((entry) => ({
      athlete_id: athleteId,
      workout_id: entry.workout_id,
      scheduled_date: entry.scheduled_date,
      ai_rationale: entry.ai_rationale,
      completed: false,
    }));

    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .insert(insertData)
      .select('*, workouts(*)');

    if (error) {
      throw new Error(`Failed to bulk schedule workouts: ${error.message}`);
    }

    return (data as CalendarEntry[]) || [];
  },

  /**
   * Get a single calendar entry by ID
   */
  async getEntryById(entryId: string, athleteId: string): Promise<CalendarEntry | null> {
    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .select('*, workouts(*)')
      .eq('id', entryId)
      .eq('athlete_id', athleteId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch calendar entry: ${error.message}`);
    }

    return data as CalendarEntry;
  },

  /**
   * Clear all calendar entries for an athlete
   */
  async clearCalendar(athleteId: string): Promise<{ deletedCount: number }> {
    // First, count how many entries will be deleted
    const { count } = await supabaseAdmin
      .from('calendar_entries')
      .select('*', { count: 'exact', head: true })
      .eq('athlete_id', athleteId);

    // Delete all entries for this athlete
    const { error } = await supabaseAdmin
      .from('calendar_entries')
      .delete()
      .eq('athlete_id', athleteId);

    if (error) {
      throw new Error(`Failed to clear calendar: ${error.message}`);
    }

    return { deletedCount: count || 0 };
  },

  /**
   * Get calendar entries AND Strava activities for a date range
   * Returns both scheduled workouts and actual rides
   */
  async getCalendarWithActivities(
    athleteId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    scheduledWorkouts: CalendarEntry[];
    stravaActivities: any[];
  }> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    // Fetch scheduled workouts
    const { data: workouts, error: workoutsError } = await supabaseAdmin
      .from('calendar_entries')
      .select('*, workouts(*)')
      .eq('athlete_id', athleteId)
      .gte('scheduled_date', startStr)
      .lte('scheduled_date', endStr)
      .order('scheduled_date', { ascending: true });

    if (workoutsError) {
      throw new Error(`Failed to fetch calendar entries: ${workoutsError.message}`);
    }

    // Fetch Strava activities for the same date range
    const { data: activities, error: activitiesError } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('start_date', startDate.toISOString())
      .lte('start_date', endDate.toISOString())
      .order('start_date', { ascending: true });

    if (activitiesError) {
      throw new Error(`Failed to fetch Strava activities: ${activitiesError.message}`);
    }

    return {
      scheduledWorkouts: (workouts as CalendarEntry[]) || [],
      stravaActivities: activities || [],
    };
  },
};
