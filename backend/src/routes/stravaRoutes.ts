import { Router } from 'express';
import * as stravaController from '../controllers/stravaController';
import * as webhookController from '../controllers/stravaWebhookController';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';

const router = Router();

// Public callback endpoint (no auth required)
router.get('/callback', stravaController.handleCallback);

// Webhook endpoints (no auth required - Strava needs direct access)
router.get('/webhook', webhookController.verifyWebhook);
router.post('/webhook', webhookController.handleWebhook);

// Admin webhook management (should add admin auth in production)
router.post('/webhook/subscribe', webhookController.createSubscription);
router.get('/webhook/subscription', webhookController.viewSubscription);
router.delete('/webhook/subscription/:subscriptionId', webhookController.deleteSubscription);

// Protected routes (require auth + subscription/beta)
router.get('/auth-url', authenticateJWT, checkSubscription, stravaController.getAuthUrl);
router.post('/connect', authenticateJWT, checkSubscription, stravaController.connectStrava);
router.post('/disconnect', authenticateJWT, checkSubscription, stravaController.disconnectStrava);
router.post('/sync', authenticateJWT, checkSubscription, stravaController.syncActivities);
router.get('/activities', authenticateJWT, checkSubscription, stravaController.getActivities);
router.get('/status', authenticateJWT, checkSubscription, stravaController.getConnectionStatus);

export default router;
