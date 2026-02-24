import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';
import { getUnacknowledged, acknowledge } from '../controllers/activityFeedbackController';

const router = Router();

router.use(authenticateJWT);
router.use(checkSubscription);

router.get('/unacknowledged', getUnacknowledged);
router.post('/:id/acknowledge', acknowledge);

export default router;
