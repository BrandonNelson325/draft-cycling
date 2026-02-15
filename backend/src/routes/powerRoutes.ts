import { Router } from 'express';
import * as powerController from '../controllers/powerController';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';

const router = Router();

// All routes require auth + subscription/beta
router.get('/prs', authenticateJWT, checkSubscription, powerController.getPersonalRecords);
router.get('/activity/:activityId', authenticateJWT, checkSubscription, powerController.getActivityPowerCurve);
router.post('/analyze/:activityId', authenticateJWT, checkSubscription, powerController.analyzeActivity);

export default router;
