import { Router } from 'express';
import * as calendarController from '../controllers/calendarController';
import { authenticateJWT } from '../middleware/auth';
import { checkSubscription } from '../middleware/subscription';

const router = Router();

// All routes require auth + subscription
router.post('/', authenticateJWT, checkSubscription, calendarController.scheduleWorkout);
router.get('/', authenticateJWT, checkSubscription, calendarController.getCalendar);
router.delete('/clear', authenticateJWT, checkSubscription, calendarController.clearCalendar);
router.put('/:id', authenticateJWT, checkSubscription, calendarController.updateCalendarEntry);
router.delete('/:id', authenticateJWT, checkSubscription, calendarController.deleteCalendarEntry);
router.post('/:id/complete', authenticateJWT, checkSubscription, calendarController.completeWorkout);
router.post('/bulk', authenticateJWT, checkSubscription, calendarController.bulkSchedule);

export default router;
