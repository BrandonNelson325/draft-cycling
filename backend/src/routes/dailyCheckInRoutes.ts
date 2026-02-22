import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import {
  getDailyReadiness,
  saveDailyCheckIn,
  getTodayMetrics,
} from '../controllers/dailyCheckInController';

const router = Router();

// All routes require authentication
router.use(authenticateJWT);

// Get daily readiness analysis
router.get('/readiness', getDailyReadiness);

// Save daily check-in
router.post('/check-in', saveDailyCheckIn);

// Get today's metrics
router.get('/today', getTodayMetrics);

export default router;
