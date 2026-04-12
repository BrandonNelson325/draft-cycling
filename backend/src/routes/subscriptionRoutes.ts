import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import * as subscriptionController from '../controllers/subscriptionController';

const router = Router();

// Public
router.get('/plans', subscriptionController.getPlans);
router.get('/mobile-callback', subscriptionController.mobileCallback);

// Webhook (no auth — Stripe signature verified in controller)
router.post('/webhook', subscriptionController.handleWebhook);

// Authenticated
router.post('/checkout', authenticateJWT, subscriptionController.createCheckout);
router.post('/portal', authenticateJWT, subscriptionController.createPortal);
router.get('/status', authenticateJWT, subscriptionController.getStatus);
router.post('/redeem', authenticateJWT, subscriptionController.redeemCode);

export default router;
