import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dailyReadinessService } from '../services/dailyReadinessService';
import { clearSuggestionCache } from '../services/dailyAnalysisService';
import { logger } from '../utils/logger';
import { supabaseAdmin } from '../utils/supabase';
import { todayInTimezone } from '../utils/timezone';

async function resolveLocalDate(athleteId: string, localDate?: string): Promise<string> {
  if (localDate) return localDate;
  const { data } = await supabaseAdmin.from('athletes').select('timezone').eq('id', athleteId).single();
  return todayInTimezone(data?.timezone || 'America/Los_Angeles');
}

export const getDailyReadiness = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const localDate = await resolveLocalDate(req.user.id, req.query.localDate as string);
    const readiness = await dailyReadinessService.getDailyReadiness(req.user.id, localDate);

    res.json(readiness);
  } catch (error: any) {
    logger.error('Get daily readiness error:', error);
    res.status(500).json({ error: error.message || 'Failed to get daily readiness' });
  }
};

export const saveDailyCheckIn = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { sleepQuality, feeling, notes, localDate } = req.body;
    const dateToUse = await resolveLocalDate(req.user.id, localDate);

    // sleepQuality is optional only when (a) objective sleep data is
    // populated for today AND (b) the athlete opted to use that source AS
    // the wellness source. The modal hides the sleep picker in that case.
    // If wellness has HRV/RHR but NO sleep_seconds (e.g. Garmin doesn't
    // write sleep to Apple Health), the picker is still shown and
    // sleepQuality remains required.
    let sleepQualityRequired = true;
    if (!sleepQuality) {
      const [{ data: existing }, { data: prefs }] = await Promise.all([
        supabaseAdmin
          .from('daily_metrics')
          .select('wellness_source, sleep_seconds')
          .eq('athlete_id', req.user.id)
          .eq('date', dateToUse)
          .maybeSingle(),
        supabaseAdmin
          .from('athletes')
          .select('intervals_icu_use_wellness, apple_health_use_for_wellness')
          .eq('id', req.user.id)
          .single(),
      ]);
      const source = existing?.wellness_source;
      const useThisSource =
        (source === 'intervals_icu' && prefs?.intervals_icu_use_wellness) ||
        (source === 'apple_health' && prefs?.apple_health_use_for_wellness);
      const hasObjectiveSleep = existing?.sleep_seconds != null;
      if (useThisSource && hasObjectiveSleep) {
        sleepQualityRequired = false;
      }
    }

    if ((sleepQualityRequired && !sleepQuality) || !feeling) {
      res.status(400).json({ error: 'Sleep quality and feeling are required' });
      return;
    }

    if (sleepQuality && !['terrible', 'poor', 'okay', 'good', 'great'].includes(sleepQuality)) {
      res.status(400).json({ error: 'Invalid sleep quality' });
      return;
    }

    if (!['exhausted', 'tired', 'normal', 'good', 'energized'].includes(feeling)) {
      res.status(400).json({ error: 'Invalid feeling' });
      return;
    }

    await dailyReadinessService.saveDailyCheckIn(req.user.id, {
      sleepQuality,
      feeling,
      notes,
    }, dateToUse);

    clearSuggestionCache(req.user.id);

    // Return updated readiness after saving
    const readiness = await dailyReadinessService.getDailyReadiness(req.user.id, dateToUse);

    res.json({
      success: true,
      message: 'Daily check-in saved',
      readiness,
    });
  } catch (error: any) {
    logger.error('Save daily check-in error:', error);
    res.status(500).json({ error: error.message || 'Failed to save check-in' });
  }
};

export const getTodayMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const localDate = await resolveLocalDate(req.user.id, req.query.localDate as string);
    const metrics = await dailyReadinessService.getTodayMetrics(req.user.id, localDate);

    res.json({ metrics });
  } catch (error: any) {
    logger.error('Get today metrics error:', error);
    res.status(500).json({ error: error.message || 'Failed to get today metrics' });
  }
};
