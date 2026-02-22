import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { trainingPlanService } from '../services/trainingPlanService';

export const getActivePlan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const plan = await trainingPlanService.getActivePlan(req.user.id);

    if (!plan) {
      res.status(404).json({ error: 'No active training plan found' });
      return;
    }

    res.json({ plan });
  } catch (error) {
    console.error('Get active plan error:', error);
    res.status(500).json({ error: 'Failed to get training plan' });
  }
};

export const getPlanById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { planId } = req.params;

    if (!planId || Array.isArray(planId)) {
      res.status(400).json({ error: 'Plan ID is required' });
      return;
    }

    const plan = await trainingPlanService.getPlanById(planId, req.user.id);

    if (!plan) {
      res.status(404).json({ error: 'Training plan not found' });
      return;
    }

    res.json({ plan });
  } catch (error) {
    console.error('Get plan error:', error);
    res.status(500).json({ error: 'Failed to get training plan' });
  }
};

export const deletePlan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { planId } = req.params;

    if (!planId || Array.isArray(planId)) {
      res.status(400).json({ error: 'Plan ID is required' });
      return;
    }

    await trainingPlanService.deletePlan(planId, req.user.id);

    res.json({ success: true, message: 'Training plan cancelled' });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: 'Failed to delete training plan' });
  }
};
