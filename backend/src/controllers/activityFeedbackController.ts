import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { activityFeedbackService } from '../services/activityFeedbackService';
import { logger } from '../utils/logger';

export const getUnacknowledged = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const activities = await activityFeedbackService.getUnacknowledgedActivities(req.user.id);
    res.json({ activities });
  } catch (error: any) {
    logger.error('Get unacknowledged activities error:', error);
    res.status(500).json({ error: error.message || 'Failed to get unacknowledged activities' });
  }
};

export const acknowledge = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const { perceived_effort, notes } = req.body;

    if (perceived_effort !== undefined) {
      const effort = Number(perceived_effort);
      if (!Number.isInteger(effort) || effort < 1 || effort > 5) {
        res.status(400).json({ error: 'perceived_effort must be an integer between 1 and 5' });
        return;
      }
    }

    await activityFeedbackService.acknowledgeActivity(req.user.id, id, {
      perceived_effort: perceived_effort !== undefined ? Number(perceived_effort) : undefined,
      notes,
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Acknowledge activity error:', error);
    const status = error.message?.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message || 'Failed to acknowledge activity' });
  }
};
