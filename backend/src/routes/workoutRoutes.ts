import { Router } from 'express';
import * as workoutController from '../controllers/workoutController';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';

const router = Router();

// All routes require auth + subscription
router.post('/', authenticateJWT, checkSubscription, workoutController.createWorkout);
router.get('/', authenticateJWT, checkSubscription, workoutController.getWorkouts);
router.get('/:id', authenticateJWT, checkSubscription, workoutController.getWorkout);
router.put('/:id', authenticateJWT, checkSubscription, workoutController.updateWorkout);
router.delete('/:id', authenticateJWT, checkSubscription, workoutController.deleteWorkout);
router.get('/:id/export/:format', authenticateJWT, checkSubscription, workoutController.exportWorkout);

export default router;
