import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { registerPushToken } from '../controllers/pushController';

const router = Router();

router.put('/token', authenticateJWT, registerPushToken);

export default router;
