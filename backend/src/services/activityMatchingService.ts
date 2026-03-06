import { supabaseAdmin } from '../utils/supabase';
import { todayInTimezone, localDayToUTCRange } from '../utils/timezone';
import { logger } from '../utils/logger';

export interface MatchResult {
  calendarEntryId: string;
  workoutName: string;
  workoutType: string;
  plannedTSS: number | null;
  plannedDuration: number; // minutes
  confidence: 'high' | 'partial' | 'low';
  tssMatch: number; // 0-1 ratio
  durationMatch: number; // 0-1 ratio
}

export interface PlannedWorkoutInfo {
  calendarEntryId: string;
  workoutId: string;
  workoutName: string;
  workoutType: string;
  plannedTSS: number | null;
  plannedDuration: number; // minutes
  description?: string;
}

async function getAthleteTz(athleteId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('athletes')
    .select('timezone')
    .eq('id', athleteId)
    .single();
  return data?.timezone || 'America/Los_Angeles';
}

export const activityMatchingService = {
  /**
   * Find the scheduled workout for the day an activity occurred.
   * Returns the planned workout info if one exists.
   */
  async getPlannedWorkoutForActivity(
    athleteId: string,
    activityStartDate: string
  ): Promise<PlannedWorkoutInfo | null> {
    const tz = await getAthleteTz(athleteId);

    // Convert activity UTC timestamp to local date
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
      new Date(activityStartDate)
    );

    const { data: entry } = await supabaseAdmin
      .from('calendar_entries')
      .select('id, workout_id, completed, workouts(id, name, workout_type, tss, duration_minutes, description)')
      .eq('athlete_id', athleteId)
      .eq('scheduled_date', localDate)
      .eq('completed', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (!entry || !entry.workouts) return null;

    const workout = entry.workouts as any;
    return {
      calendarEntryId: entry.id,
      workoutId: workout.id,
      workoutName: workout.name,
      workoutType: workout.workout_type,
      plannedTSS: workout.tss,
      plannedDuration: workout.duration_minutes,
      description: workout.description,
    };
  },

  /**
   * Compare a completed activity against a planned workout and score the match.
   */
  scoreMatch(
    activity: { tss: number | null; moving_time_seconds: number | null },
    planned: { tss: number | null; duration_minutes: number }
  ): { confidence: 'high' | 'partial' | 'low'; tssMatch: number; durationMatch: number } {
    const activityDurationMin = (activity.moving_time_seconds || 0) / 60;
    const plannedDurationMin = planned.duration_minutes || 1;

    // Duration match: ratio of actual to planned (capped at 1.0)
    const durationRatio = activityDurationMin / plannedDurationMin;
    const durationMatch = durationRatio > 1
      ? Math.max(0, 1 - (durationRatio - 1)) // penalize going over
      : durationRatio;

    // TSS match: ratio of actual to planned
    let tssMatch = 1.0;
    if (planned.tss && planned.tss > 0) {
      const actualTSS = activity.tss || 0;
      const tssRatio = actualTSS / planned.tss;
      tssMatch = tssRatio > 1
        ? Math.max(0, 1 - (tssRatio - 1))
        : tssRatio;
    }

    // Combined score (weight duration more since TSS can vary a lot)
    const combined = durationMatch * 0.4 + tssMatch * 0.6;

    let confidence: 'high' | 'partial' | 'low';
    if (combined >= 0.7) {
      confidence = 'high';
    } else if (combined >= 0.35) {
      confidence = 'partial';
    } else {
      confidence = 'low';
    }

    return {
      confidence,
      tssMatch: Math.round(tssMatch * 100) / 100,
      durationMatch: Math.round(durationMatch * 100) / 100,
    };
  },

  /**
   * Called after a Strava activity is synced. Checks if it matches a planned workout.
   * If high confidence match, auto-completes the calendar entry.
   */
  async matchAndComplete(
    athleteId: string,
    activityId: string,
    activityData: {
      start_date: string;
      tss: number | null;
      moving_time_seconds: number | null;
      strava_activity_id: number;
    }
  ): Promise<MatchResult | null> {
    try {
      const planned = await this.getPlannedWorkoutForActivity(
        athleteId,
        activityData.start_date
      );

      if (!planned) return null;

      const match = this.scoreMatch(
        { tss: activityData.tss, moving_time_seconds: activityData.moving_time_seconds },
        { tss: planned.plannedTSS, duration_minutes: planned.plannedDuration }
      );

      // Auto-complete if high confidence
      if (match.confidence === 'high') {
        const { error } = await supabaseAdmin
          .from('calendar_entries')
          .update({
            completed: true,
            completed_at: new Date().toISOString(),
            strava_activity_id: activityData.strava_activity_id,
            notes: 'Auto-matched from Strava activity',
          })
          .eq('id', planned.calendarEntryId)
          .eq('athlete_id', athleteId);

        if (error) {
          logger.error('[Match] Failed to auto-complete calendar entry:', error);
        } else {
          logger.info(
            `[Match] Auto-completed workout "${planned.workoutName}" for athlete ${athleteId} ` +
            `(confidence: ${match.confidence}, TSS: ${match.tssMatch}, duration: ${match.durationMatch})`
          );
        }
      }

      return {
        calendarEntryId: planned.calendarEntryId,
        workoutName: planned.workoutName,
        workoutType: planned.workoutType,
        plannedTSS: planned.plannedTSS,
        plannedDuration: planned.plannedDuration,
        ...match,
      };
    } catch (err) {
      logger.error('[Match] Error matching activity:', err);
      return null;
    }
  },

  /**
   * Called when user acknowledges an activity and says it WAS the planned workout.
   * Marks the calendar entry as complete.
   */
  async confirmMatch(
    athleteId: string,
    calendarEntryId: string,
    stravaActivityId: number
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('calendar_entries')
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
        strava_activity_id: stravaActivityId,
        notes: 'Confirmed by athlete',
      })
      .eq('id', calendarEntryId)
      .eq('athlete_id', athleteId);

    if (error) {
      logger.error('[Match] Failed to confirm match:', error);
      throw new Error('Failed to mark workout as complete');
    }
  },

  /**
   * Called when user says the activity was NOT the planned workout.
   * The calendar entry stays incomplete — Phase 2 will handle plan adaptation.
   */
  async rejectMatch(
    athleteId: string,
    calendarEntryId: string
  ): Promise<void> {
    // Mark the entry with a note so the coach knows the athlete did something different
    await supabaseAdmin
      .from('calendar_entries')
      .update({
        notes: 'Athlete did a different ride than planned',
      })
      .eq('id', calendarEntryId)
      .eq('athlete_id', athleteId);

    logger.info(
      `[Match] Athlete ${athleteId} rejected match for calendar entry ${calendarEntryId}. ` +
      'Plan adaptation needed.'
    );
  },
};
