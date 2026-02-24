import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { trainingLoadService } from '../services/trainingLoadService';

export const getTrainingStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const status = await trainingLoadService.getTrainingStatus(req.user.id);

    if (!status) {
      res.status(500).json({ error: 'Failed to calculate training status' });
      return;
    }

    res.json(status);
  } catch (error) {
    console.error('Get training status error:', error);
    res.status(500).json({ error: 'Failed to get training status' });
  }
};

export const recalculateTSS = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await trainingLoadService.recalculateAllTSS(req.user.id);

    res.json({
      message: `Recalculated TSS for ${result.updated} of ${result.total} activities`,
      ...result,
    });
  } catch (error) {
    console.error('Recalculate TSS error:', error);
    res.status(500).json({ error: 'Failed to recalculate TSS' });
  }
};

export const getMetricsHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const days = req.query.days ? parseInt(req.query.days as string, 10) : 90;

    const metrics = await trainingLoadService.getMetricsHistory(req.user.id, days);

    if (!metrics) {
      res.json({
        message: 'No metrics history available',
        metrics: [],
      });
      return;
    }

    res.json({ metrics });
  } catch (error) {
    console.error('Get metrics history error:', error);
    res.status(500).json({ error: 'Failed to get metrics history' });
  }
};
