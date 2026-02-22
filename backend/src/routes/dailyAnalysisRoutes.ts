import { Router } from 'express';
import * as dailyAnalysisController from '../controllers/dailyAnalysisController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

// Daily analysis routes
router.get('/today', authenticateJWT, dailyAnalysisController.getDailyAnalysis);
router.get('/should-show', authenticateJWT, dailyAnalysisController.shouldShowDailyAnalysis);
router.post('/mark-viewed', authenticateJWT, dailyAnalysisController.markDailyAnalysisViewed);

export default router;
