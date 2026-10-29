import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dailyAnalysisService, clearSuggestionCache, resolveEasierReplacement, loadMakeupSlot } from '../services/dailyAnalysisService';
import { buildWorkoutFromSpec } from '../services/trainingPlanService';
import { workoutService } from '../services/workoutService';
import { integrationSyncService } from '../services/integrationSyncService';
import { supabaseAdmin } from '../utils/supabase';
import { todayInTimezone } from '../utils/timezone';
import { logger } from '../utils/logger';

/**
 * Get today's daily analysis
 */
export const getDailyAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const analysis = await dailyAnalysisService.generateDailyAnalysis(req.user.id);

    res.json(analysis);
  } catch (error: any) {
    console.error('Error generating daily analysis:', error);
    res.status(500).json({ error: 'Failed to generate daily analysis' });
  }
};

/**
 * Check if user should see daily analysis (first login today)
 */
export const shouldShowDailyAnalysis = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const hasViewed = await dailyAnalysisService.hasViewedToday(req.user.id);

    res.json({
      shouldShow: !hasViewed,
      hasViewedToday: hasViewed,
    });
  } catch (error: any) {
    console.error('Error checking daily analysis status:', error);
    res.status(500).json({ error: 'Failed to check analysis status' });
  }
};

/**
 * Get today's suggestion (cached, AI-powered)
 */
export const getTodaySuggestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const suggestion = await dailyAnalysisService.getTodaySuggestion(req.user.id);
    res.json(suggestion);
  } catch (error: any) {
    console.error('Error getting today\'s suggestion:', error);
    res.status(500).json({ error: 'Failed to get today\'s suggestion' });
  }
};

/**
 * Accept the AI-suggested adjustment for today.
 * Currently only kind='rest' mutates the calendar — it converts today's planned workout
 * into a rest day while snapshotting the original workout_id for "originally planned" display.
 */
export const acceptAdjustment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { kind, reason, replacement } = req.body as {
      kind: 'rest' | 'easier';
      reason?: string;
      replacement?: { type?: string; duration?: number };
    };
    if (kind !== 'rest' && kind !== 'easier') {
      res.status(400).json({ error: 'kind must be "rest" or "easier"' });
      return;
    }

    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('timezone')
      .eq('id', req.user.id)
      .single();
    const todayStr = todayInTimezone(athlete?.timezone || 'America/Los_Angeles');

    const { data: entry, error: fetchErr } = await supabaseAdmin
      .from('calendar_entries')
      .select('id, workout_id, entry_type, workouts(name, workout_type, duration_minutes)')
      .eq('athlete_id', req.user.id)
      .eq('scheduled_date', todayStr)
      .eq('completed', false)
      .maybeSingle();

    if (fetchErr || !entry || !entry.workout_id) {
      res.status(404).json({ error: 'No planned workout found for today' });
      return;
    }

    // Snapshot the original so the plan can be shown/restored; then swap in
    // either a rest day or the easier session the card showed.
    const snapshot = {
      original_workout_id: entry.workout_id,
      original_entry_type: entry.entry_type,
      adjusted_at: new Date().toISOString(),
      adjustment_kind: kind,
      adjustment_reason: reason || null,
    };
    // Same lookup the card used: a hard session moves to the next easy day
    // (the days swap) instead of being dropped.
    const makeup = await loadMakeupSlot(req.user.id, todayStr, (entry as any).workouts);
    let update: Record<string, any>;
    if (kind === 'easier' && makeup) {
      update = { ...snapshot, workout_id: makeup.workout.id, entry_type: 'workout', ai_rationale: reason || 'Coach-suggested easier session' };
    } else if (kind === 'rest') {
      update = { ...snapshot, workout_id: null, entry_type: 'rest', ai_rationale: reason || 'Coach-suggested rest day' };
    } else {
      const r = resolveEasierReplacement(
        { type: replacement?.type, duration_minutes: replacement?.duration },
        (entry as any).workouts?.duration_minutes
      );
      const spec = buildWorkoutFromSpec({
        workout_type: r.type,
        duration_minutes: r.duration,
        day_of_week: 0,
        rationale: reason || 'Coach-suggested easier session for today',
      });
      const workout = await workoutService.createWorkout(req.user.id, {
        name: spec.name,
        description: spec.description,
        workout_type: spec.workout_type as any,
        duration_minutes: spec.duration_minutes,
        intervals: spec.intervals,
        generated_by_ai: true,
        ai_prompt: 'Accepted daily suggestion (easier)',
      });
      update = { ...snapshot, workout_id: workout.id, entry_type: 'workout', ai_rationale: reason || 'Coach-suggested easier session' };
    }

    const { error: updateErr } = await supabaseAdmin
      .from('calendar_entries')
      .update(update)
      .eq('id', entry.id);

    if (updateErr) {
      logger.error('Failed to apply adjustment:', updateErr);
      res.status(500).json({ error: 'Failed to apply adjustment' });
      return;
    }

    if (makeup) {
      const { error: moveErr } = await supabaseAdmin
        .from('calendar_entries')
        .update({ workout_id: entry.workout_id, entry_type: 'workout' })
        .eq('id', makeup.entryId);
      if (moveErr) logger.error(`Failed to move ${entry.workout_id} to ${makeup.date}:`, moveErr);
      else {
        const [y, m, d] = makeup.date.split('-').map(Number);
        integrationSyncService
          .mirrorMove(req.user.id, makeup.entryId, entry.workout_id, new Date(y, m - 1, d, 12))
          .catch((err) => logger.warn(`[Sync] Accept makeup resync failed: ${err.message}`));
      }
    }

    clearSuggestionCache(req.user.id);
    // Mirror to every connected service (Wahoo, intervals.icu): the old workout
    // must come off the head unit, and the easier one go on.
    if (kind === 'easier' && update.workout_id) {
      integrationSyncService
        .mirrorMove(req.user.id, entry.id, update.workout_id, new Date(todayStr + 'T12:00:00'))
        .catch((err) => logger.warn(`[Sync] Accept-easier resync failed: ${err.message}`));
    } else {
      // Rest day: delete the remote copies of the planned workout.
      const refs = await integrationSyncService.captureForDeletion(req.user.id, [entry.id]);
      integrationSyncService.deleteRemotes(req.user.id, refs);
      if (refs.length) {
        await supabaseAdmin
          .from('workout_syncs')
          .update({ sync_status: 'deleted', last_synced_at: new Date().toISOString() })
          .eq('athlete_id', req.user.id)
          .eq('calendar_entry_id', entry.id);
      }
    }
    res.json({ success: true, moved: makeup ? { date: makeup.date, workoutId: entry.workout_id } : null });
  } catch (error: any) {
    logger.error('Error accepting adjustment:', error);
    res.status(500).json({ error: 'Failed to accept adjustment' });
  }
};

/**
 * Dismiss today's suggested adjustment — keep the planned workout as-is.
 * Persists per-day so the override stays hidden until tomorrow (or until cache invalidates
 * on a new ride / calendar edit, in which case a fresh AI call decides anew).
 */
export const dismissAdjustment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('timezone')
      .eq('id', req.user.id)
      .single();
    const todayStr = todayInTimezone(athlete?.timezone || 'America/Los_Angeles');

    const { error } = await supabaseAdmin
      .from('adjustment_dismissals')
      .upsert(
        { athlete_id: req.user.id, dismissed_date: todayStr },
        { onConflict: 'athlete_id,dismissed_date' }
      );

    if (error) {
      logger.error('Failed to dismiss adjustment:', error);
      res.status(500).json({ error: 'Failed to dismiss adjustment' });
      return;
    }

    clearSuggestionCache(req.user.id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error dismissing adjustment:', error);
    res.status(500).json({ error: 'Failed to dismiss adjustment' });
  }
};

/**
 * Mark daily analysis as viewed
 */
export const markDailyAnalysisViewed = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await dailyAnalysisService.markAsViewed(req.user.id);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error marking analysis as viewed:', error);
    res.status(500).json({ error: 'Failed to mark analysis as viewed' });
  }
};
