import { Router } from 'express';
import * as integrationsController from '../controllers/integrationsController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

// Intervals.icu routes
router.get('/intervals-icu/auth-url', authenticateJWT, integrationsController.getIntervalsIcuAuthUrl);
router.get('/intervals-icu/callback', integrationsController.handleIntervalsIcuCallback);
router.get('/intervals-icu/status', authenticateJWT, integrationsController.getIntervalsIcuStatus);
router.post('/intervals-icu/sync', authenticateJWT, integrationsController.syncWorkoutToIntervalsIcu);
router.post('/intervals-icu/sync-all', authenticateJWT, integrationsController.syncAllToIntervalsIcu);
router.post('/intervals-icu/settings', authenticateJWT, integrationsController.updateIntervalsIcuSettings);
router.delete('/intervals-icu', authenticateJWT, integrationsController.disconnectIntervalsIcu);

// Wahoo routes
router.get('/wahoo/auth-url', authenticateJWT, integrationsController.getWahooAuthUrl);
router.get('/wahoo/callback', integrationsController.handleWahooCallback);
router.get('/wahoo/status', authenticateJWT, integrationsController.getWahooStatus);
router.post('/wahoo/sync', authenticateJWT, integrationsController.syncWorkoutToWahoo);
router.post('/wahoo/settings', authenticateJWT, integrationsController.updateWahooSettings);
router.delete('/wahoo', authenticateJWT, integrationsController.disconnectWahoo);

export default router;
