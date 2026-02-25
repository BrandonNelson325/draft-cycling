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
router.post('/chat/stream', authenticateJWT, checkSubscription, aiCoachController.chatStream);
router.post('/start-conversation', authenticateJWT, checkSubscription, aiCoachController.startConversation);
router.get('/conversations', authenticateJWT, checkSubscription, aiCoachController.getConversations);
router.get('/conversations/:conversationId/messages', authenticateJWT, checkSubscription, aiCoachController.getConversationMessages);
router.delete('/conversations/:conversationId', authenticateJWT, checkSubscription, aiCoachController.deleteConversation);

export default router;
