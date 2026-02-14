import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected routes
router.post('/logout', authenticateJWT, authController.logout);
router.get('/me', authenticateJWT, authController.getProfile);
router.put('/me', authenticateJWT, authController.updateProfile);

export default router;
