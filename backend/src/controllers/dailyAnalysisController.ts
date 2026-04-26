import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dailyAnalysisService, clearSuggestionCache } from '../services/dailyAnalysisService';
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

    const { kind, reason } = req.body as { kind: 'rest' | 'easier'; reason?: string };
    if (kind !== 'rest') {
      res.status(400).json({ error: 'Only kind="rest" can be accepted in v1' });
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
      .select('id, workout_id, entry_type')
      .eq('athlete_id', req.user.id)
      .eq('scheduled_date', todayStr)
      .eq('completed', false)
      .maybeSingle();

    if (fetchErr || !entry || !entry.workout_id) {
      res.status(404).json({ error: 'No planned workout found for today' });
      return;
    }

    const { error: updateErr } = await supabaseAdmin
      .from('calendar_entries')
      .update({
        original_workout_id: entry.workout_id,
        original_entry_type: entry.entry_type,
        adjusted_at: new Date().toISOString(),
        adjustment_kind: 'rest',
        adjustment_reason: reason || null,
        workout_id: null,
        entry_type: 'rest',
        ai_rationale: reason || 'Coach-suggested rest day',
      })
      .eq('id', entry.id);

    if (updateErr) {
      logger.error('Failed to apply adjustment:', updateErr);
      res.status(500).json({ error: 'Failed to apply adjustment' });
      return;
    }

    clearSuggestionCache(req.user.id);
    res.json({ success: true });
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
