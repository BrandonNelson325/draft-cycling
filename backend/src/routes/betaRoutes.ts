import { Router } from 'express';
import * as betaController from '../controllers/betaController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.post('/activate', authenticateJWT, betaController.activateBetaAccess);
router.get('/check', authenticateJWT, betaController.checkBetaAccess);

export default router;
