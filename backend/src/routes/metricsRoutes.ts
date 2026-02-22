import { Router } from 'express';
import * as metricsController from '../controllers/metricsController';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';

const router = Router();

// All routes require authentication and subscription
router.get('/', authenticateJWT, checkSubscription, metricsController.getMetrics);

export default router;
