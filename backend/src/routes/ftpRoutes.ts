import { Router } from 'express';
import * as ftpController from '../controllers/ftpController';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';

const router = Router();

// All routes require auth + subscription/beta
router.get('/estimate', authenticateJWT, checkSubscription, ftpController.getEstimatedFTP);
router.post('/update', authenticateJWT, checkSubscription, ftpController.updateFTPFromEstimation);
router.get('/history', authenticateJWT, checkSubscription, ftpController.getFTPHistory);

export default router;
