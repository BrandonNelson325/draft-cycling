import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { dailyAnalysisService } from '../services/dailyAnalysisService';

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
