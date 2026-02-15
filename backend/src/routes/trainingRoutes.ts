import { Router } from 'express';
import * as trainingController from '../controllers/trainingController';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';

const router = Router();

// All routes require auth + subscription/beta
router.get('/status', authenticateJWT, checkSubscription, trainingController.getTrainingStatus);
router.get('/metrics', authenticateJWT, checkSubscription, trainingController.getMetricsHistory);

export default router;
