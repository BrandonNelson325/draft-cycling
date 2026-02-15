import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { aiCoachService } from '../services/aiCoachService';

export const analyzeTraining = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const analysis = await aiCoachService.analyzeTraining(req.user.id);

    res.json({ analysis });
  } catch (error: any) {
    console.error('Analyze training error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze training' });
  }
};

export const analyzeRide = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { activityId } = req.params;

    if (!activityId || Array.isArray(activityId)) {
      res.status(400).json({ error: 'Valid activity ID required' });
      return;
    }

    const analysis = await aiCoachService.analyzeRide(
      req.user.id,
      parseInt(activityId, 10)
    );

    res.json({ analysis });
  } catch (error: any) {
    console.error('Analyze ride error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze ride' });
  }
};

export const suggestWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { workoutType } = req.body;

    const suggestion = await aiCoachService.suggestWorkout(req.user.id, workoutType);

    res.json({ suggestion });
  } catch (error: any) {
    console.error('Suggest workout error:', error);
    res.status(500).json({ error: error.message || 'Failed to suggest workout' });
  }
};

export const chat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { conversationId, message } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const result = await aiCoachService.chat(
      req.user.id,
      conversationId || null,
      message
    );

    res.json(result);
  } catch (error: any) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message || 'Chat failed' });
  }
};

export const getConversations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // This would be implemented with Supabase query
    // For now, placeholder
    res.json({ conversations: [] });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
};
