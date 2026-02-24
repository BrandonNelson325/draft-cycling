import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dailyReadinessService } from '../services/dailyReadinessService';
import { logger } from '../utils/logger';

export const getDailyReadiness = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const localDate = (req.query.localDate as string) || new Date().toISOString().split('T')[0];
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
    const dateToUse = localDate || new Date().toISOString().split('T')[0];

    if (!sleepQuality || !feeling) {
      res.status(400).json({ error: 'Sleep quality and feeling are required' });
      return;
    }

    if (!['poor', 'good', 'great'].includes(sleepQuality)) {
      res.status(400).json({ error: 'Invalid sleep quality' });
      return;
    }

    if (!['tired', 'normal', 'energized'].includes(feeling)) {
      res.status(400).json({ error: 'Invalid feeling' });
      return;
    }

    await dailyReadinessService.saveDailyCheckIn(req.user.id, {
      sleepQuality,
      feeling,
      notes,
    }, dateToUse);

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

    const localDate = (req.query.localDate as string) || new Date().toISOString().split('T')[0];
    const metrics = await dailyReadinessService.getTodayMetrics(req.user.id, localDate);

    res.json({ metrics });
  } catch (error: any) {
    logger.error('Get today metrics error:', error);
    res.status(500).json({ error: error.message || 'Failed to get today metrics' });
  }
};
