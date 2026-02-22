import { supabaseAdmin } from '../utils/supabase';
import {
  Workout,
  CreateWorkoutDTO,
  UpdateWorkoutDTO,
  WorkoutFilters,
  WorkoutInterval,
  ValidationResult,
} from '../types/workout';

export const workoutService = {
  /**
   * Create a new workout
   */
  async createWorkout(athleteId: string, data: CreateWorkoutDTO): Promise<Workout> {
    // Validate intervals
    const validation = await this.validateIntervals(data.intervals);
    if (!validation.valid) {
      throw new Error(`Invalid intervals: ${validation.errors.join(', ')}`);
    }

    // Get athlete's FTP for TSS calculation
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp')
      .eq('id', athleteId)
      .single();

    if (!athlete || !athlete.ftp) {
      throw new Error('Athlete FTP not set');
    }

    // Calculate TSS
    const tss = await this.calculateTSS(data.intervals, athlete.ftp);

    // Insert workout
    const { data: workout, error } = await supabaseAdmin
      .from('workouts')
      .insert({
        athlete_id: athleteId,
        name: data.name,
        description: data.description,
        workout_type: data.workout_type,
        duration_minutes: data.duration_minutes,
        tss,
        intervals: data.intervals,
        generated_by_ai: data.generated_by_ai || false,
        ai_prompt: data.ai_prompt,
        training_plan_id: data.training_plan_id,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create workout: ${error.message}`);
    }

    return workout as Workout;
  },

  /**
   * Get all workouts for an athlete with optional filters
   */
  async getWorkouts(athleteId: string, filters?: WorkoutFilters): Promise<Workout[]> {
    let query = supabaseAdmin
      .from('workouts')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false });

    if (filters) {
      if (filters.workout_type) {
        query = query.eq('workout_type', filters.workout_type);
      }
      if (filters.ai_generated !== undefined) {
        query = query.eq('generated_by_ai', filters.ai_generated);
      }
      if (filters.min_duration) {
        query = query.gte('duration_minutes', filters.min_duration);
      }
      if (filters.max_duration) {
        query = query.lte('duration_minutes', filters.max_duration);
      }
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch workouts: ${error.message}`);
    }

    return (data as Workout[]) || [];
  },

  /**
   * Get a single workout by ID
   */
  async getWorkoutById(id: string, athleteId: string): Promise<Workout | null> {
    const { data, error } = await supabaseAdmin
      .from('workouts')
      .select('*')
      .eq('id', id)
      .eq('athlete_id', athleteId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch workout: ${error.message}`);
    }

    return data as Workout;
  },

  /**
   * Update a workout
   */
  async updateWorkout(
    id: string,
    athleteId: string,
    data: UpdateWorkoutDTO
  ): Promise<Workout> {
    // If intervals are being updated, validate them and recalculate TSS
    if (data.intervals) {
      const validation = await this.validateIntervals(data.intervals);
      if (!validation.valid) {
        throw new Error(`Invalid intervals: ${validation.errors.join(', ')}`);
      }

      // Get athlete's FTP
      const { data: athlete } = await supabaseAdmin
        .from('athletes')
        .select('ftp')
        .eq('id', athleteId)
        .single();

      if (athlete && athlete.ftp) {
        data.tss = await this.calculateTSS(data.intervals, athlete.ftp);
      }
    }

    const { data: workout, error } = await supabaseAdmin
      .from('workouts')
      .update(data)
      .eq('id', id)
      .eq('athlete_id', athleteId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update workout: ${error.message}`);
    }

    return workout as Workout;
  },

  /**
   * Delete a workout
   */
  async deleteWorkout(id: string, athleteId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('workouts')
      .delete()
      .eq('id', id)
      .eq('athlete_id', athleteId);

    if (error) {
      throw new Error(`Failed to delete workout: ${error.message}`);
    }
  },

  /**
   * Calculate TSS for a workout based on intervals
   * TSS = (duration_hours * power% * IF) * 100
   * IF (Intensity Factor) = normalized_power / FTP
   */
  async calculateTSS(intervals: WorkoutInterval[], ftp: number): Promise<number> {
    let totalTSS = 0;

    for (const interval of intervals) {
      const durationHours = interval.duration / 3600;

      // For ramps, use average of low and high power
      let powerPercent: number;
      if (interval.type === 'ramp' && interval.power_low && interval.power_high) {
        powerPercent = (interval.power_low + interval.power_high) / 2;
      } else {
        powerPercent = interval.power || 100;
      }

      const intensityFactor = powerPercent / 100;

      // TSS calculation
      const intervalTSS = durationHours * intensityFactor * intensityFactor * 100;
      const repeat = interval.repeat || 1;

      totalTSS += intervalTSS * repeat;
    }

    return Math.round(totalTSS);
  },

  /**
   * Validate workout intervals
   */
  async validateIntervals(intervals: WorkoutInterval[]): Promise<ValidationResult> {
    const errors: string[] = [];

    if (!intervals || intervals.length === 0) {
      errors.push('At least one interval is required');
      return { valid: false, errors };
    }

    intervals.forEach((interval, index) => {
      // Validate duration
      if (!interval.duration || interval.duration <= 0) {
        errors.push(`Interval ${index + 1}: Duration must be greater than 0`);
      }

      // Validate type
      if (!interval.type) {
        errors.push(`Interval ${index + 1}: Type is required`);
      }

      // Validate power targets
      if (interval.type === 'ramp') {
        if (!interval.power_low || !interval.power_high) {
          errors.push(`Interval ${index + 1}: Ramp intervals require power_low and power_high`);
        }
        if (interval.power_low && (interval.power_low < 30 || interval.power_low > 200)) {
          errors.push(
            `Interval ${index + 1}: power_low should be between 30% and 200% of FTP`
          );
        }
        if (interval.power_high && (interval.power_high < 30 || interval.power_high > 200)) {
          errors.push(
            `Interval ${index + 1}: power_high should be between 30% and 200% of FTP`
          );
        }
      } else if (interval.power) {
        if (interval.power < 30 || interval.power > 200) {
          errors.push(`Interval ${index + 1}: Power should be between 30% and 200% of FTP`);
        }
      }

      // Validate cadence
      if (interval.cadence && (interval.cadence < 40 || interval.cadence > 150)) {
        errors.push(`Interval ${index + 1}: Cadence should be between 40 and 150 RPM`);
      }

      // Validate repeat
      if (interval.repeat && (interval.repeat < 1 || interval.repeat > 50)) {
        errors.push(`Interval ${index + 1}: Repeat should be between 1 and 50`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};
