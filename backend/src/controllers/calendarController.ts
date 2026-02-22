import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { calendarService } from '../services/calendarService';
import { ScheduleWorkoutDTO, BulkScheduleDTO, CompleteWorkoutDTO } from '../types/calendar';

export const scheduleWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data: ScheduleWorkoutDTO = req.body;

    if (!data.workout_id || !data.scheduled_date) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const entry = await calendarService.scheduleWorkout(
      req.user.id,
      data.workout_id,
      new Date(data.scheduled_date),
      data.ai_rationale
    );

    res.status(201).json(entry);
  } catch (error: any) {
    console.error('Schedule workout error:', error);
    res.status(500).json({ error: error.message || 'Failed to schedule workout' });
  }
};

export const getCalendar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;

    if (!start || !end) {
      res.status(400).json({ error: 'Missing start or end date' });
      return;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    // Get both calendar entries and Strava activities for the date range
    const calendarData = await calendarService.getCalendarWithActivities(
      req.user.id,
      startDate,
      endDate
    );

    res.json(calendarData);
  } catch (error: any) {
    console.error('Get calendar error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch calendar' });
  }
};

export const updateCalendarEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const updates = req.body;

    const entry = await calendarService.updateEntry(id, req.user.id, updates);

    res.json(entry);
  } catch (error: any) {
    console.error('Update calendar entry error:', error);
    res.status(500).json({ error: error.message || 'Failed to update calendar entry' });
  }
};

export const deleteCalendarEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;

    await calendarService.deleteEntry(id, req.user.id);

    res.status(204).send();
  } catch (error: any) {
    console.error('Delete calendar entry error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete calendar entry' });
  }
};

export const completeWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const data: CompleteWorkoutDTO = req.body;

    const entry = await calendarService.completeWorkout(
      id,
      req.user.id,
      data.notes,
      data.strava_activity_id
    );

    res.json(entry);
  } catch (error: any) {
    console.error('Complete workout error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete workout' });
  }
};

export const bulkSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data: BulkScheduleDTO = req.body;

    if (!data.entries || !Array.isArray(data.entries)) {
      res.status(400).json({ error: 'Missing or invalid entries array' });
      return;
    }

    const entries = await calendarService.bulkSchedule(req.user.id, data.entries);

    res.status(201).json({ entries });
  } catch (error: any) {
    console.error('Bulk schedule error:', error);
    res.status(500).json({ error: error.message || 'Failed to bulk schedule workouts' });
  }
};

export const clearCalendar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await calendarService.clearCalendar(req.user.id);

    res.json({
      message: 'Calendar cleared successfully',
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    console.error('Clear calendar error:', error);
    res.status(500).json({ error: error.message || 'Failed to clear calendar' });
  }
};
