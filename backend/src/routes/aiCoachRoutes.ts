import { Router } from 'express';
import * as aiCoachController from '../controllers/aiCoachController';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';

const router = Router();

// All routes require auth + subscription/beta
router.get('/analyze-training', authenticateJWT, checkSubscription, aiCoachController.analyzeTraining);
router.get('/analyze-ride/:activityId', authenticateJWT, checkSubscription, aiCoachController.analyzeRide);
router.post('/suggest-workout', authenticateJWT, checkSubscription, aiCoachController.suggestWorkout);
router.post('/chat', authenticateJWT, checkSubscription, aiCoachController.chat);
router.get('/conversations', authenticateJWT, checkSubscription, aiCoachController.getConversations);

export default router;
