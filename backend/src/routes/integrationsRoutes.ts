import { Router } from 'express';
import * as integrationsController from '../controllers/integrationsController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

// Intervals.icu routes
router.get('/intervals-icu/auth-url', authenticateJWT, integrationsController.getIntervalsIcuAuthUrl);
router.get('/intervals-icu/callback', integrationsController.handleIntervalsIcuCallback);
router.get('/intervals-icu/status', authenticateJWT, integrationsController.getIntervalsIcuStatus);
router.post('/intervals-icu/sync', authenticateJWT, integrationsController.syncWorkoutToIntervalsIcu);
router.post('/intervals-icu/settings', authenticateJWT, integrationsController.updateIntervalsIcuSettings);
router.delete('/intervals-icu', authenticateJWT, integrationsController.disconnectIntervalsIcu);

export default router;
