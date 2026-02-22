import { ToolUseBlock } from '@anthropic-ai/sdk/resources';
import { workoutService } from './workoutService';
import { calendarService } from './calendarService';
import { storageService } from './storageService';
import { trainingPlanService } from './trainingPlanService';
import { athletePreferencesService } from './athletePreferencesService';
import { zwoGenerator } from './fileGenerators/zwoGenerator';
import { fitGenerator } from './fileGenerators/fitGenerator';
import { supabaseAdmin } from '../utils/supabase';
import { CreateWorkoutDTO } from '../types/workout';
import { logger } from '../utils/logger';

interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export const aiToolExecutor = {
  /**
   * Execute multiple tool calls and return results
   */
  async executeTools(athleteId: string, toolCalls: ToolUseBlock[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      try {
        logger.debug(`\n=== Executing tool: ${toolCall.name} ===`);
        logger.debug('Input:', JSON.stringify(toolCall.input, null, 2));

        let result: any;

        switch (toolCall.name) {
          case 'create_workout':
            result = await this.createWorkout(athleteId, toolCall.input);
            logger.debug('✅ create_workout SUCCESS:', result.success);
            break;
          case 'schedule_workout':
            result = await this.scheduleWorkout(athleteId, toolCall.input);
            logger.debug('✅ schedule_workout SUCCESS:', result.success);
            break;
          case 'move_workout':
            result = await this.moveWorkout(athleteId, toolCall.input);
            break;
          case 'delete_workout_from_calendar':
            result = await this.deleteWorkoutFromCalendar(athleteId, toolCall.input);
            break;
          case 'get_calendar':
            result = await this.getCalendar(athleteId, toolCall.input);
            break;
          case 'get_workouts':
            result = await this.getWorkouts(athleteId, toolCall.input);
            break;
          case 'update_athlete_ftp':
            result = await this.updateFTP(athleteId, toolCall.input);
            break;
          case 'generate_training_plan':
            result = await this.generateTrainingPlan(athleteId, toolCall.input);
            break;
          case 'update_athlete_preferences':
            result = await this.updateAthletePreferences(athleteId, toolCall.input);
            break;
          default:
            throw new Error(`Unknown tool: ${toolCall.name}`);
        }

        results.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: JSON.stringify(result, null, 2),
        });
      } catch (error: any) {
        console.error(`\n❌ ERROR executing tool ${toolCall.name}:`);
        console.error('Error message:', error.message);
        console.error('Stack:', error.stack);
        results.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          is_error: true,
          content: error.message || 'Tool execution failed',
        });
      }
    }

    return results;
  },

  /**
   * Create a workout
   */
  async createWorkout(athleteId: string, input: any): Promise<any> {
    // Validate intervals
    const validation = await workoutService.validateIntervals(input.intervals);
    if (!validation.valid) {
      throw new Error(`Invalid intervals: ${validation.errors.join(', ')}`);
    }

    // Get athlete's FTP
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp')
      .eq('id', athleteId)
      .single();

    if (!athlete || !athlete.ftp) {
      throw new Error('Athlete FTP not set. Please set your FTP first.');
    }

    // Calculate TSS
    const tss = await workoutService.calculateTSS(input.intervals, athlete.ftp);

    // Create workout
    const workoutData: CreateWorkoutDTO = {
      name: input.name,
      description: input.description,
      workout_type: input.workout_type,
      duration_minutes: input.duration_minutes,
      intervals: input.intervals,
      generated_by_ai: true,
      ai_prompt: 'Generated via AI tool call',
    };

    const workout = await workoutService.createWorkout(athleteId, workoutData);

    // Try to generate and upload files, but don't fail workout creation if it errors
    let zwoUrl: string | undefined;
    let fitUrl: string | undefined;

    try {
      const zwoContent = zwoGenerator.generate(workout, athlete.ftp);
      zwoUrl = await storageService.uploadWorkoutFile(athleteId, workout.id, 'zwo', zwoContent);
    } catch (zwoError: any) {
      console.error('ZWO generation/upload failed, but workout created:', zwoError.message);
      // Continue without ZWO file
    }

    try {
      const fitContent = fitGenerator.generate(workout, athlete.ftp);
      fitUrl = await storageService.uploadWorkoutFile(athleteId, workout.id, 'fit', fitContent);
    } catch (fitError: any) {
      console.error('FIT generation/upload failed, but workout created:', fitError.message);
      // Continue without FIT file
    }

    // Update workout with file URLs if they were successfully generated
    if (zwoUrl || fitUrl) {
      const updateData: any = {};
      if (zwoUrl) updateData.zwo_file_url = zwoUrl;
      if (fitUrl) updateData.fit_file_url = fitUrl;
      await workoutService.updateWorkout(workout.id, athleteId, updateData);
    }

    return {
      success: true,
      workout: {
        id: workout.id,
        name: workout.name,
        workout_type: workout.workout_type,
        duration_minutes: workout.duration_minutes,
        tss: workout.tss,
        intervals: workout.intervals,
        zwo_file_url: zwoUrl,
        fit_file_url: fitUrl,
      },
    };
  },

  /**
   * Schedule a workout
   */
  async scheduleWorkout(athleteId: string, input: any): Promise<any> {
    // Parse date as local date to avoid timezone issues
    // Input format: "YYYY-MM-DD"
    const [year, month, day] = input.scheduled_date.split('-').map(Number);
    const scheduledDate = new Date(year, month - 1, day); // month is 0-indexed
    const dayOfWeek = scheduledDate.getDay();

    // Get athlete's rest days preference from training_goal
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('training_goal')
      .eq('id', athleteId)
      .single();

    // Parse rest days from training_goal (ONLY if explicitly mentioned)
    const restDays: number[] = [];

    if (athlete?.training_goal) {
      const goalLower = athlete.training_goal.toLowerCase();

      // Check for explicit rest day mentions
      if ((goalLower.includes('sunday') || goalLower.includes('sundays')) &&
          (goalLower.includes('off') || goalLower.includes('rest'))) {
        restDays.push(0);
      }
      if ((goalLower.includes('monday') || goalLower.includes('mondays')) &&
          (goalLower.includes('off') || goalLower.includes('rest'))) {
        restDays.push(1);
      }
      if ((goalLower.includes('tuesday') || goalLower.includes('tuesdays')) &&
          (goalLower.includes('off') || goalLower.includes('rest'))) {
        restDays.push(2);
      }
      if ((goalLower.includes('wednesday') || goalLower.includes('wednesdays')) &&
          (goalLower.includes('off') || goalLower.includes('rest'))) {
        restDays.push(3);
      }
      if ((goalLower.includes('thursday') || goalLower.includes('thursdays')) &&
          (goalLower.includes('off') || goalLower.includes('rest'))) {
        restDays.push(4);
      }
      if ((goalLower.includes('friday') || goalLower.includes('fridays')) &&
          (goalLower.includes('off') || goalLower.includes('rest'))) {
        restDays.push(5);
      }
      if ((goalLower.includes('saturday') || goalLower.includes('saturdays')) &&
          (goalLower.includes('off') || goalLower.includes('rest'))) {
        restDays.push(6);
      }
    }

    // Validate: Don't schedule on explicitly stated rest days
    if (restDays.length > 0 && restDays.includes(dayOfWeek)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      throw new Error(
        `Cannot schedule workout on ${dayNames[dayOfWeek]} - this is a rest day. ` +
        `Please choose a different day.`
      );
    }

    const entry = await calendarService.scheduleWorkout(
      athleteId,
      input.workout_id,
      scheduledDate,
      input.rationale
    );

    return {
      success: true,
      entry: {
        id: entry.id,
        workout_id: entry.workout_id,
        scheduled_date: entry.scheduled_date,
        ai_rationale: entry.ai_rationale,
        workout_name: entry.workouts?.name,
      },
    };
  },

  /**
   * Move a workout to a different date
   */
  async moveWorkout(athleteId: string, input: any): Promise<any> {
    // Parse date as local date to avoid timezone issues
    const [year, month, day] = input.new_date.split('-').map(Number);
    const newDate = new Date(year, month - 1, day);

    const entry = await calendarService.moveWorkout(
      input.entry_id,
      athleteId,
      newDate
    );

    return {
      success: true,
      entry: {
        id: entry.id,
        workout_id: entry.workout_id,
        scheduled_date: entry.scheduled_date,
        workout_name: entry.workouts?.name,
      },
    };
  },

  /**
   * Delete a workout from calendar
   */
  async deleteWorkoutFromCalendar(athleteId: string, input: any): Promise<any> {
    await calendarService.deleteEntry(input.entry_id, athleteId);

    return {
      success: true,
      message: 'Workout removed from calendar',
    };
  },

  /**
   * Get calendar entries
   */
  async getCalendar(athleteId: string, input: any): Promise<any> {
    // Parse dates as local dates to avoid timezone issues
    const [startYear, startMonth, startDay] = input.start_date.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay);

    const [endYear, endMonth, endDay] = input.end_date.split('-').map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    const entries = await calendarService.getCalendarEntries(
      athleteId,
      startDate,
      endDate
    );

    return {
      entries: entries.map((e) => ({
        id: e.id,
        workout_id: e.workout_id,
        scheduled_date: e.scheduled_date,
        completed: e.completed,
        workout_name: e.workouts?.name,
        workout_type: e.workouts?.workout_type,
        duration_minutes: e.workouts?.duration_minutes,
        tss: e.workouts?.tss,
      })),
    };
  },

  /**
   * Get workouts from library
   */
  async getWorkouts(athleteId: string, input: any): Promise<any> {
    const workouts = await workoutService.getWorkouts(athleteId, {
      workout_type: input.workout_type,
      ai_generated: input.ai_generated,
    });

    return {
      workouts: workouts.map((w) => ({
        id: w.id,
        name: w.name,
        workout_type: w.workout_type,
        duration_minutes: w.duration_minutes,
        tss: w.tss,
        generated_by_ai: w.generated_by_ai,
      })),
    };
  },

  /**
   * Update athlete FTP
   */
  async updateFTP(athleteId: string, input: any): Promise<any> {
    const { error } = await supabaseAdmin
      .from('athletes')
      .update({
        ftp: input.ftp,
        updated_at: new Date().toISOString(),
      })
      .eq('id', athleteId);

    if (error) {
      throw new Error(`Failed to update FTP: ${error.message}`);
    }

    return {
      success: true,
      ftp: input.ftp,
      rationale: input.rationale,
    };
  },

  /**
   * Generate a complete training plan
   */
  async generateTrainingPlan(athleteId: string, input: any): Promise<any> {
    // Parse event date as local date to avoid timezone issues
    const [year, month, day] = input.event_date.split('-').map(Number);
    const eventDate = new Date(year, month - 1, day);

    // Build training plan config
    const config = {
      goal_event: input.goal_event,
      event_date: eventDate,
      current_fitness_level: input.current_fitness_level,
      weekly_hours: input.weekly_hours,
      strengths: input.strengths || [],
      weaknesses: input.weaknesses || [],
      preferences: {
        indoor_outdoor: input.indoor_outdoor || 'both',
        zwift_availability: input.zwift_availability || false,
      },
    };

    // Generate the plan
    const plan = await trainingPlanService.generatePlan(athleteId, config);

    // Save plan to database
    await trainingPlanService.savePlan(athleteId, plan);

    // Schedule all workouts to calendar
    const { scheduledCount, workoutIds } = await trainingPlanService.schedulePlanToCalendar(
      athleteId,
      plan
    );

    return {
      success: true,
      plan: {
        id: plan.id,
        goal_event: plan.goal_event,
        event_date: plan.event_date,
        start_date: plan.start_date,
        total_weeks: plan.weeks.length,
        total_workouts: scheduledCount,
        total_tss: plan.total_tss,
        phases: {
          base: plan.weeks.filter((w) => w.phase === 'base').length,
          build: plan.weeks.filter((w) => w.phase === 'build').length,
          peak: plan.weeks.filter((w) => w.phase === 'peak').length,
          taper: plan.weeks.filter((w) => w.phase === 'taper').length,
        },
      },
      workouts_scheduled: scheduledCount,
      workout_ids: workoutIds,
    };
  },

  /**
   * Update athlete preferences
   */
  async updateAthletePreferences(athleteId: string, input: any): Promise<any> {
    const updated = await athletePreferencesService.updatePreferences(
      athleteId,
      input.preferences
    );

    return {
      success: true,
      message: 'Preferences saved successfully',
      preferences: updated,
    };
  },
};
