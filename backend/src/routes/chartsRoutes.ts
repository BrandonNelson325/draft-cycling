import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';
import { chartsController } from '../controllers/chartsController';

const router = Router();

router.get('/weekly', authenticateJWT, checkSubscription, chartsController.getWeeklyData);
router.get('/fitness', authenticateJWT, checkSubscription, chartsController.getFitnessTimeSeries);
router.get('/power-zones', authenticateJWT, checkSubscription, chartsController.getPowerZoneDistribution);

export default router;
