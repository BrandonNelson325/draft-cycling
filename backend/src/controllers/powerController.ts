import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { powerAnalysisService } from '../services/powerAnalysisService';

export const getPersonalRecords = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const prs = await powerAnalysisService.getPersonalRecords(req.user.id);

    if (!prs) {
      res.json({
        message: 'No power data available yet',
        prs: null,
      });
      return;
    }

    res.json({ prs });
  } catch (error) {
    console.error('Get personal records error:', error);
    res.status(500).json({ error: 'Failed to get personal records' });
  }
};

export const getActivityPowerCurve = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { activityId } = req.params;

    if (!activityId || Array.isArray(activityId)) {
      res.status(400).json({ error: 'Valid activity ID is required' });
      return;
    }

    const powerCurve = await powerAnalysisService.getActivityPowerCurve(
      req.user.id,
      parseInt(activityId, 10)
    );

    if (!powerCurve) {
      res.status(404).json({ error: 'Power curve not found for this activity' });
      return;
    }

    res.json({ power_curve: powerCurve });
  } catch (error) {
    console.error('Get activity power curve error:', error);
    res.status(500).json({ error: 'Failed to get power curve' });
  }
};

export const analyzeActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { activityId } = req.params;

    if (!activityId || Array.isArray(activityId)) {
      res.status(400).json({ error: 'Valid activity ID is required' });
      return;
    }

    const powerCurve = await powerAnalysisService.analyzePowerCurve(
      req.user.id,
      parseInt(activityId, 10)
    );

    if (!powerCurve) {
      res.status(400).json({ error: 'Activity does not have power data' });
      return;
    }

    res.json({
      message: 'Activity analyzed successfully',
      power_curve: powerCurve,
    });
  } catch (error: any) {
    console.error('Analyze activity error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze activity' });
  }
};
