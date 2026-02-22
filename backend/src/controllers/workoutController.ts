import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { workoutService } from '../services/workoutService';
import { storageService } from '../services/storageService';
import { zwoGenerator } from '../services/fileGenerators/zwoGenerator';
import { fitGenerator } from '../services/fileGenerators/fitGenerator';
import { supabaseAdmin } from '../utils/supabase';
import { CreateWorkoutDTO, WorkoutFilters } from '../types/workout';

export const createWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const workoutData: CreateWorkoutDTO = req.body;

    // Validate required fields
    if (!workoutData.name || !workoutData.workout_type || !workoutData.intervals) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const workout = await workoutService.createWorkout(req.user.id, workoutData);

    res.status(201).json(workout);
  } catch (error: any) {
    console.error('Create workout error:', error);
    res.status(500).json({ error: error.message || 'Failed to create workout' });
  }
};

export const getWorkouts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const typeParam = req.query.type as string | undefined;
    const aiGeneratedParam = req.query.ai_generated as string | undefined;
    const minDurationParam = req.query.min_duration as string | undefined;
    const maxDurationParam = req.query.max_duration as string | undefined;

    const filters: WorkoutFilters = {
      workout_type: typeParam as any,
      ai_generated: aiGeneratedParam === 'true' ? true : undefined,
      min_duration: minDurationParam ? parseInt(minDurationParam) : undefined,
      max_duration: maxDurationParam ? parseInt(maxDurationParam) : undefined,
    };

    const workouts = await workoutService.getWorkouts(req.user.id, filters);

    res.json(workouts);
  } catch (error: any) {
    console.error('Get workouts error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch workouts' });
  }
};

export const getWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const workout = await workoutService.getWorkoutById(id, req.user.id);

    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    res.json(workout);
  } catch (error: any) {
    console.error('Get workout error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch workout' });
  }
};

export const updateWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const updateData = req.body;

    const workout = await workoutService.updateWorkout(id, req.user.id, updateData);

    // If intervals were updated, regenerate files
    if (updateData.intervals) {
      const { data: athlete } = await supabaseAdmin
        .from('athletes')
        .select('ftp')
        .eq('id', req.user.id)
        .single();

      if (athlete && athlete.ftp) {
        // Delete old files
        await storageService.deleteWorkoutFiles(req.user.id, id);

        // Generate new files
        const zwoContent = zwoGenerator.generate(workout, athlete.ftp);
        const fitContent = fitGenerator.generate(workout, athlete.ftp);

        const zwoUrl = await storageService.uploadWorkoutFile(
          req.user.id,
          id,
          'zwo',
          zwoContent
        );
        const fitUrl = await storageService.uploadWorkoutFile(
          req.user.id,
          id,
          'fit',
          fitContent
        );

        // Update workout with new URLs
        await workoutService.updateWorkout(id, req.user.id, {
          zwo_file_url: zwoUrl,
          fit_file_url: fitUrl,
        });

        workout.zwo_file_url = zwoUrl;
        workout.fit_file_url = fitUrl;
      }
    }

    res.json(workout);
  } catch (error: any) {
    console.error('Update workout error:', error);
    res.status(500).json({ error: error.message || 'Failed to update workout' });
  }
};

export const deleteWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;

    // Delete workout files from storage
    await storageService.deleteWorkoutFiles(req.user.id, id);

    // Delete workout from database
    await workoutService.deleteWorkout(id, req.user.id);

    res.status(204).send();
  } catch (error: any) {
    console.error('Delete workout error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete workout' });
  }
};

export const exportWorkout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = req.params.id as string;
    const format = req.params.format as string;

    if (format !== 'zwo' && format !== 'fit') {
      res.status(400).json({ error: 'Invalid format. Must be "zwo" or "fit"' });
      return;
    }

    // Get workout
    const workout = await workoutService.getWorkoutById(id, req.user.id);
    if (!workout) {
      res.status(404).json({ error: 'Workout not found' });
      return;
    }

    // Get athlete's FTP
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp')
      .eq('id', req.user.id)
      .single();

    if (!athlete || !athlete.ftp) {
      res.status(400).json({ error: 'FTP not set. Please set your FTP first.' });
      return;
    }

    // Generate file content
    let content: string | Buffer;
    let contentType: string;
    let filename: string;

    if (format === 'zwo') {
      content = zwoGenerator.generate(workout, athlete.ftp);
      contentType = 'application/xml';
      filename = `${workout.name.replace(/[^a-z0-9]/gi, '_')}.zwo`;
    } else {
      content = fitGenerator.generate(workout, athlete.ftp);
      contentType = 'application/octet-stream';
      filename = `${workout.name.replace(/[^a-z0-9]/gi, '_')}.fit`;
    }

    // Upload to storage if not already present
    const fileUrlKey = `${format}_file_url`;
    if (!workout[fileUrlKey as keyof typeof workout]) {
      const url = await storageService.uploadWorkoutFile(req.user.id, workout.id, format, content);
      await workoutService.updateWorkout(workout.id, req.user.id, {
        [fileUrlKey]: url,
      });
    }

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(content);
  } catch (error: any) {
    console.error('Export workout error:', error);
    res.status(500).json({ error: error.message || 'Failed to export workout' });
  }
};
