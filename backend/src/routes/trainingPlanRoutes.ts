import { Router } from 'express';
import * as trainingPlanController from '../controllers/trainingPlanController';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';

const router = Router();

// All routes require auth + subscription
router.get('/active', authenticateJWT, checkSubscription, trainingPlanController.getActivePlan);
router.get('/:planId', authenticateJWT, checkSubscription, trainingPlanController.getPlanById);
router.delete('/:planId', authenticateJWT, checkSubscription, trainingPlanController.deletePlan);

export default router;
