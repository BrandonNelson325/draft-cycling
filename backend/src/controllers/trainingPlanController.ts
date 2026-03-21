import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { trainingPlanService } from '../services/trainingPlanService';
import { supabaseAdmin } from '../utils/supabase';

export const getActivePlans = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const plans = await trainingPlanService.getActivePlans(req.user.id);
    res.json({ plans });
  } catch (error) {
    console.error('Get active plans error:', error);
    res.status(500).json({ error: 'Failed to get training plans' });
  }
};

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

    const removeWorkouts = req.query.removeWorkouts === 'true';
    const result = await trainingPlanService.deletePlan(planId, req.user.id, removeWorkouts);

    res.json({
      success: true,
      message: removeWorkouts
        ? `Training plan cancelled. Removed ${result.removedCount} workouts from calendar.`
        : 'Training plan cancelled',
      removedCount: result.removedCount,
    });
  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({ error: 'Failed to delete training plan' });
  }
};

export const getTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { difficulty, search } = req.query;

    let query = supabaseAdmin
      .from('training_plan_templates')
      .select('id, name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, tags, sort_order')
      .order('sort_order', { ascending: true });

    if (difficulty && typeof difficulty === 'string') {
      query = query.eq('difficulty_level', difficulty);
    }

    if (search && typeof search === 'string') {
      const sanitized = search.replace(/[%_.,()]/g, '');
      if (sanitized.length > 0) {
        query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Get templates error:', error);
      res.status(500).json({ error: 'Failed to get training plan templates' });
      return;
    }

    res.json({ templates: data || [] });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to get training plan templates' });
  }
};
