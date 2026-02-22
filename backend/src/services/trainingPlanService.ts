import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../utils/supabase';
import { workoutService } from './workoutService';
import { calendarService } from './calendarService';
import { athletePreferencesService } from './athletePreferencesService';
import {
  TrainingPlanConfig,
  TrainingPlan,
  TrainingWeek,
  WorkoutTemplate,
  PhaseDurations,
  TrainingPhase,
  FitnessLevel,
} from '../types/trainingPlan';

export const trainingPlanService = {
  /**
   * Generate a complete training plan
   */
  async generatePlan(athleteId: string, config: TrainingPlanConfig): Promise<TrainingPlan> {
    // Get athlete's current FTP and training goal
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp, training_goal')
      .eq('id', athleteId)
      .single();

    if (!athlete || !athlete.ftp) {
      throw new Error('Athlete FTP not set');
    }

    // Get rest days from athlete preferences
    const preferences = await athletePreferencesService.getPreferences(athleteId);
    const restDays = preferences.rest_days || [];

    // Also check training_goal field for rest day mentions (legacy support)
    if (athlete.training_goal && restDays.length === 0) {
      const goalLower = athlete.training_goal.toLowerCase();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      dayNames.forEach((day, index) => {
        if ((goalLower.includes(day) || goalLower.includes(day + 's')) &&
            (goalLower.includes('off') || goalLower.includes('rest'))) {
          const dayName = day.charAt(0).toUpperCase() + day.slice(1);
          if (!restDays.includes(dayName)) {
            restDays.push(dayName);
          }
        }
      });
    }

    // Calculate weeks until event
    const weeksUntilEvent = this.calculateWeeks(config.event_date);

    if (weeksUntilEvent < 4) {
      throw new Error('Need at least 4 weeks to build a training plan');
    }

    // Determine phase durations
    const phases = this.calculatePhases(weeksUntilEvent);

    // Get current CTL (chronic training load) to base plan off current fitness
    const currentCTL = await this.estimateCurrentCTL(athleteId);

    // Generate week-by-week structure
    const weeks = this.generateWeeklyStructure(
      athleteId,
      athlete.ftp,
      config,
      phases,
      currentCTL,
      restDays  // Pass rest days
    );

    // Create plan object
    const plan: TrainingPlan = {
      id: uuidv4(),
      athlete_id: athleteId,
      goal_event: config.goal_event,
      event_date: config.event_date.toISOString().split('T')[0],
      start_date: new Date().toISOString().split('T')[0],
      weeks,
      total_tss: weeks.reduce((sum, week) => sum + week.tss, 0),
      created_at: new Date().toISOString(),
    };

    return plan;
  },

  /**
   * Calculate number of weeks until event
   */
  calculateWeeks(eventDate: Date): number {
    const now = new Date();
    const diffTime = eventDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7);
  },

  /**
   * Calculate phase durations based on total weeks
   */
  calculatePhases(totalWeeks: number): PhaseDurations {
    if (totalWeeks >= 16) {
      // Long plan: more time in base
      return {
        base: Math.floor(totalWeeks * 0.4), // 40% in base
        build: Math.floor(totalWeeks * 0.35), // 35% in build
        peak: Math.floor(totalWeeks * 0.15), // 15% in peak
        taper: Math.max(1, Math.floor(totalWeeks * 0.1)), // 10% taper, min 1 week
      };
    } else if (totalWeeks >= 12) {
      // Medium plan
      return {
        base: Math.floor(totalWeeks * 0.35),
        build: Math.floor(totalWeeks * 0.35),
        peak: Math.floor(totalWeeks * 0.2),
        taper: Math.max(1, Math.floor(totalWeeks * 0.1)),
      };
    } else if (totalWeeks >= 8) {
      // Short plan
      return {
        base: Math.floor(totalWeeks * 0.3),
        build: Math.floor(totalWeeks * 0.4),
        peak: Math.floor(totalWeeks * 0.2),
        taper: 1,
      };
    } else {
      // Very short plan (4-7 weeks)
      return {
        base: Math.floor(totalWeeks * 0.25),
        build: Math.floor(totalWeeks * 0.5),
        peak: Math.floor(totalWeeks * 0.15),
        taper: 1,
      };
    }
  },

  /**
   * Estimate current CTL from recent activities
   */
  async estimateCurrentCTL(athleteId: string): Promise<number> {
    const { data: recentActivities } = await supabaseAdmin
      .from('strava_activities')
      .select('tss')
      .eq('athlete_id', athleteId)
      .gte(
        'start_date',
        new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString()
      )
      .order('start_date', { ascending: false });

    if (!recentActivities || recentActivities.length === 0) {
      return 50; // Default starting CTL for new athletes
    }

    // Simple average TSS per day
    const totalTSS = recentActivities.reduce((sum, a) => sum + (a.tss || 0), 0);
    const avgDailyTSS = totalTSS / 42;

    return Math.round(avgDailyTSS);
  },

  /**
   * Generate week-by-week workout structure
   */
  generateWeeklyStructure(
    athleteId: string,
    ftp: number,
    config: TrainingPlanConfig,
    phases: PhaseDurations,
    startingCTL: number,
    restDays: string[] = []
  ): TrainingWeek[] {
    const weeks: TrainingWeek[] = [];
    let currentCTL = startingCTL;
    let weekNumber = 1;

    // Base phase
    for (let i = 0; i < phases.base; i++) {
      const isRecoveryWeek = (i + 1) % 4 === 0;
      const weeklyTSS = isRecoveryWeek ? currentCTL * 5 : currentCTL * 7; // 5-7 days of current CTL

      weeks.push({
        week_number: weekNumber++,
        phase: 'base',
        tss: Math.round(weeklyTSS),
        workouts: this.generateBasePhaseWorkouts(ftp, weeklyTSS, config, restDays),
        notes: isRecoveryWeek ? 'Recovery week - reduce volume' : undefined,
      });

      if (!isRecoveryWeek) {
        currentCTL *= 1.05; // 5% increase per week
      }
    }

    // Build phase
    for (let i = 0; i < phases.build; i++) {
      const isRecoveryWeek = (i + 1) % 3 === 0;
      const weeklyTSS = isRecoveryWeek ? currentCTL * 5 : currentCTL * 7;

      weeks.push({
        week_number: weekNumber++,
        phase: 'build',
        tss: Math.round(weeklyTSS),
        workouts: this.generateBuildPhaseWorkouts(ftp, weeklyTSS, config, restDays),
        notes: isRecoveryWeek ? 'Recovery week - maintain intensity, reduce volume' : undefined,
      });

      if (!isRecoveryWeek) {
        currentCTL *= 1.08; // 8% increase per week in build
      }
    }

    // Peak phase
    for (let i = 0; i < phases.peak; i++) {
      weeks.push({
        week_number: weekNumber++,
        phase: 'peak',
        tss: Math.round(currentCTL * 7),
        workouts: this.generatePeakPhaseWorkouts(ftp, currentCTL * 7, config, restDays),
        notes: 'High intensity work - maintain freshness',
      });
    }

    // Taper phase
    for (let i = 0; i < phases.taper; i++) {
      const taperFactor = 0.5 - i * 0.1; // 50%, 40%, 30%...
      const weeklyTSS = currentCTL * 7 * taperFactor;

      weeks.push({
        week_number: weekNumber++,
        phase: 'taper',
        tss: Math.round(weeklyTSS),
        workouts: this.generateTaperPhaseWorkouts(ftp, weeklyTSS, config, restDays),
        notes: 'Taper week - maintain intensity, reduce volume significantly',
      });
    }

    return weeks;
  },

  /**
   * Generate base phase workouts (aerobic development)
   */
  generateBasePhaseWorkouts(
    ftp: number,
    weeklyTSS: number,
    config: TrainingPlanConfig,
    restDays: string[] = []
  ): WorkoutTemplate[] {
    const workouts: WorkoutTemplate[] = [];
    const workoutsPerWeek = Math.min(Math.floor(config.weekly_hours / 1.5), 6);
    const avgTSSPerWorkout = weeklyTSS / workoutsPerWeek;

    // Convert rest day names to numbers (0=Sunday, 6=Saturday)
    const dayMap: Record<string, number> = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    const restDayNumbers = restDays.map(day => dayMap[day]).filter(d => d !== undefined);

    // Available training days (excluding rest days)
    const availableDays = [1, 2, 3, 4, 5, 6, 0].filter(day => !restDayNumbers.includes(day));

    if (availableDays.length === 0) {
      // If all days are rest days (shouldn't happen), return empty
      return [];
    }

    let dayIndex = 0;

    // Endurance workout
    if (workoutsPerWeek >= 1 && availableDays.length > dayIndex) {
      workouts.push({
        name: 'Base Endurance',
        description: 'Steady aerobic endurance ride',
        workout_type: 'endurance',
        duration_minutes: Math.round((avgTSSPerWorkout / 65) * 100),
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 3000, power: 72, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    // Tempo workout
    if (workoutsPerWeek >= 2 && availableDays.length > dayIndex) {
      workouts.push({
        name: 'Tempo Building',
        description: 'Upper Zone 2 / lower Zone 3 tempo work',
        workout_type: 'tempo',
        duration_minutes: Math.round((avgTSSPerWorkout / 75) * 100),
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 1200, power: 78, type: 'work' },
          { duration: 300, power: 60, type: 'rest' },
          { duration: 1200, power: 78, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    // Long endurance (prefer Saturday if available, else use next available day)
    if (workoutsPerWeek >= 3 && availableDays.length > dayIndex) {
      const longRideTSS = avgTSSPerWorkout * 1.5;
      const preferredDay = availableDays.includes(6) ? 6 : availableDays[dayIndex++];

      workouts.push({
        name: 'Long Base Ride',
        description: 'Extended aerobic endurance',
        workout_type: 'endurance',
        duration_minutes: Math.round((longRideTSS / 65) * 100),
        day_of_week: preferredDay,
        intervals: [
          { duration: 900, power: 60, type: 'warmup' },
          { duration: 5400, power: 70, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    // Easy recovery - skip if day is a rest day
    if (workoutsPerWeek >= 4 && availableDays.length > dayIndex) {
      workouts.push({
        name: 'Easy Recovery',
        description: 'Low intensity recovery ride',
        workout_type: 'recovery',
        duration_minutes: 45,
        day_of_week: availableDays[dayIndex++],
        intervals: [{ duration: 2700, power: 55, type: 'work' }],
      });
    }

    return workouts;
  },

  /**
   * Generate build phase workouts (threshold and tempo)
   */
  generateBuildPhaseWorkouts(
    ftp: number,
    weeklyTSS: number,
    config: TrainingPlanConfig,
    restDays: string[] = []
  ): WorkoutTemplate[] {
    const workouts: WorkoutTemplate[] = [];
    const workoutsPerWeek = Math.min(Math.floor(config.weekly_hours / 1.5), 6);

    // Convert rest day names to numbers
    const dayMap: Record<string, number> = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    const restDayNumbers = restDays.map(day => dayMap[day]).filter(d => d !== undefined);

    // Available training days (excluding rest days)
    const availableDays = [2, 4, 6, 1, 3, 5, 0].filter(day => !restDayNumbers.includes(day));

    if (availableDays.length === 0) return [];

    let dayIndex = 0;

    // Sweet Spot / Threshold
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Sweet Spot Intervals',
        description: 'Sub-threshold intervals at 88-94% FTP',
        workout_type: 'threshold',
        duration_minutes: 90,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 1200, power: 90, type: 'work', repeat: 3 },
          { duration: 300, power: 60, type: 'rest', repeat: 3 },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
        rationale: 'Build FTP and lactate threshold',
      });
    }

    // Tempo with bursts
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Tempo + Bursts',
        description: 'Tempo pace with short harder efforts',
        workout_type: 'tempo',
        duration_minutes: 75,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 600, power: 85, type: 'work' },
          { duration: 30, power: 110, type: 'work', repeat: 4 },
          { duration: 90, power: 85, type: 'work', repeat: 4 },
          { duration: 300, power: 60, type: 'rest' },
          { duration: 600, power: 85, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    // Over-Unders
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Over-Under Intervals',
        description: 'Alternating above and below threshold',
        workout_type: 'threshold',
        duration_minutes: 90,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 180, power: 95, type: 'work', repeat: 3 },
          { duration: 120, power: 105, type: 'work', repeat: 3 },
          { duration: 420, power: 60, type: 'rest' },
          { duration: 180, power: 95, type: 'work', repeat: 3 },
          { duration: 120, power: 105, type: 'work', repeat: 3 },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
        rationale: 'Improve ability to clear lactate at threshold',
      });
    }

    // Endurance maintenance
    if (workoutsPerWeek >= 4 && availableDays.length > dayIndex) {
      workouts.push({
        name: 'Endurance Maintenance',
        description: 'Maintain aerobic base',
        workout_type: 'endurance',
        duration_minutes: 120,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 6000, power: 72, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    return workouts;
  },

  /**
   * Generate peak phase workouts (VO2max and race-specific)
   */
  generatePeakPhaseWorkouts(
    ftp: number,
    weeklyTSS: number,
    config: TrainingPlanConfig,
    restDays: string[] = []
  ): WorkoutTemplate[] {
    const workouts: WorkoutTemplate[] = [];

    // Convert rest day names to numbers
    const dayMap: Record<string, number> = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    const restDayNumbers = restDays.map(day => dayMap[day]).filter(d => d !== undefined);

    // Available training days (excluding rest days)
    const availableDays = [2, 4, 6, 1, 3, 5, 0].filter(day => !restDayNumbers.includes(day));

    if (availableDays.length < 2) return []; // Need at least 2 days for peak phase

    let dayIndex = 0;

    // VO2max intervals
    workouts.push({
      name: 'VO2max Intervals',
      description: 'High intensity VO2max efforts',
      workout_type: 'vo2max',
      duration_minutes: 75,
      day_of_week: availableDays[dayIndex++],
      intervals: [
        { duration: 900, power: 65, type: 'warmup' },
        { duration: 300, power: 115, type: 'work', repeat: 5 },
        { duration: 300, power: 55, type: 'rest', repeat: 5 },
        { duration: 300, power: 55, type: 'cooldown' },
      ],
      rationale: 'Maximize aerobic power',
    });

    // Threshold
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Threshold Blocks',
        description: 'Sustained threshold efforts',
        workout_type: 'threshold',
        duration_minutes: 90,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 600, power: 65, type: 'warmup' },
          { duration: 1200, power: 95, type: 'work', repeat: 2 },
          { duration: 600, power: 60, type: 'rest', repeat: 2 },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
      });
    }

    // Race simulation
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Race Simulation',
        description: 'Simulate race efforts with surges',
        workout_type: 'custom',
        duration_minutes: 90,
        day_of_week: availableDays[dayIndex++],
        intervals: [
          { duration: 900, power: 65, type: 'warmup' },
          { duration: 1800, power: 85, type: 'work' },
          { duration: 60, power: 120, type: 'work', repeat: 3 },
          { duration: 180, power: 90, type: 'work', repeat: 3 },
          { duration: 1200, power: 95, type: 'work' },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
        rationale: 'Practice race pace with surges',
      });
    }

    // Recovery workout
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Active Recovery',
        description: 'Easy spin to recover',
        workout_type: 'recovery',
        duration_minutes: 60,
        day_of_week: availableDays[dayIndex++],
        intervals: [{ duration: 3600, power: 58, type: 'work' }],
      });
    }

    return workouts;
  },

  /**
   * Generate taper phase workouts (maintain intensity, reduce volume)
   */
  generateTaperPhaseWorkouts(
    ftp: number,
    weeklyTSS: number,
    config: TrainingPlanConfig,
    restDays: string[] = []
  ): WorkoutTemplate[] {
    const workouts: WorkoutTemplate[] = [];

    // Convert rest day names to numbers
    const dayMap: Record<string, number> = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    };
    const restDayNumbers = restDays.map(day => dayMap[day]).filter(d => d !== undefined);

    // Available training days (excluding rest days)
    const availableDays = [2, 4, 5, 1, 3, 6, 0].filter(day => !restDayNumbers.includes(day));

    if (availableDays.length === 0) return [];

    let dayIndex = 0;

    // Short VO2max openers
    workouts.push({
      name: 'Race Openers',
      description: 'Short high-intensity efforts to stay sharp',
      workout_type: 'vo2max',
      duration_minutes: 45,
      day_of_week: availableDays[dayIndex++],
      intervals: [
        { duration: 600, power: 65, type: 'warmup' },
        { duration: 120, power: 115, type: 'work', repeat: 3 },
        { duration: 240, power: 60, type: 'rest', repeat: 3 },
        { duration: 300, power: 55, type: 'cooldown' },
      ],
      rationale: 'Keep legs fresh and sharp',
    });

    // Easy spin
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Easy Spin',
        description: 'Very easy recovery',
        workout_type: 'recovery',
        duration_minutes: 30,
        day_of_week: availableDays[dayIndex++],
        intervals: [{ duration: 1800, power: 55, type: 'work' }],
      });
    }

    // Short activation (if race is upcoming)
    if (availableDays.length > dayIndex) {
      workouts.push({
        name: 'Pre-Race Activation',
        description: 'Final tune-up before race',
        workout_type: 'custom',
        duration_minutes: 30,
        day_of_week: availableDays[dayIndex++],
        intervals: [
        { duration: 600, power: 60, type: 'warmup' },
        { duration: 60, power: 110, type: 'work', repeat: 3 },
        { duration: 120, power: 65, type: 'rest', repeat: 3 },
        { duration: 300, power: 55, type: 'cooldown' },
      ],
      rationale: 'Activate systems before race day',
      });
    }

    return workouts;
  },

  /**
   * Save training plan to database
   */
  async savePlan(athleteId: string, plan: TrainingPlan): Promise<void> {
    const endDate = new Date(plan.start_date);
    endDate.setDate(endDate.getDate() + plan.weeks.length * 7);

    const { error } = await supabaseAdmin.from('training_plans').insert({
      id: plan.id,
      athlete_id: athleteId,
      goal_event: plan.goal_event,
      event_date: plan.event_date,
      start_date: plan.start_date,
      end_date: endDate.toISOString().split('T')[0],
      weeks: plan.weeks,
      total_tss: plan.total_tss,
      total_weeks: plan.weeks.length,
      status: 'active',
    });

    if (error) {
      throw new Error(`Failed to save training plan: ${error.message}`);
    }
  },

  /**
   * Get active training plan for athlete
   */
  async getActivePlan(athleteId: string): Promise<TrainingPlan | null> {
    const { data, error } = await supabaseAdmin
      .from('training_plans')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      athlete_id: data.athlete_id,
      goal_event: data.goal_event,
      event_date: data.event_date,
      start_date: data.start_date,
      weeks: data.weeks,
      total_tss: data.total_tss,
      created_at: data.created_at,
    };
  },

  /**
   * Get training plan by ID
   */
  async getPlanById(planId: string, athleteId: string): Promise<TrainingPlan | null> {
    const { data, error } = await supabaseAdmin
      .from('training_plans')
      .select('*')
      .eq('id', planId)
      .eq('athlete_id', athleteId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      athlete_id: data.athlete_id,
      goal_event: data.goal_event,
      event_date: data.event_date,
      start_date: data.start_date,
      weeks: data.weeks,
      total_tss: data.total_tss,
      created_at: data.created_at,
    };
  },

  /**
   * Delete training plan
   */
  async deletePlan(planId: string, athleteId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('training_plans')
      .update({ status: 'cancelled' })
      .eq('id', planId)
      .eq('athlete_id', athleteId);

    if (error) {
      throw new Error(`Failed to delete training plan: ${error.message}`);
    }
  },

  /**
   * Schedule training plan to calendar
   */
  async schedulePlanToCalendar(
    athleteId: string,
    plan: TrainingPlan
  ): Promise<{ scheduledCount: number; workoutIds: string[] }> {
    const startDate = new Date(plan.start_date);
    const workoutIds: string[] = [];
    let scheduledCount = 0;

    for (const week of plan.weeks) {
      for (const workoutTemplate of week.workouts) {
        // Create workout
        const workout = await workoutService.createWorkout(athleteId, {
          name: workoutTemplate.name,
          description: workoutTemplate.description,
          workout_type: workoutTemplate.workout_type as any,
          duration_minutes: workoutTemplate.duration_minutes,
          intervals: workoutTemplate.intervals,
          generated_by_ai: true,
          ai_prompt: `Training plan: ${plan.goal_event} - Week ${week.week_number} (${week.phase} phase)`,
          training_plan_id: plan.id,
        });

        workoutIds.push(workout.id);

        // Calculate scheduled date
        const weekOffset = week.week_number - 1;
        const scheduledDate = new Date(startDate);
        scheduledDate.setDate(scheduledDate.getDate() + weekOffset * 7 + workoutTemplate.day_of_week);

        // Schedule to calendar
        await calendarService.scheduleWorkout(
          athleteId,
          workout.id,
          scheduledDate,
          workoutTemplate.rationale ||
            `Week ${week.week_number} - ${week.phase} phase: ${workoutTemplate.name}`,
          plan.id,
          week.week_number
        );

        scheduledCount++;
      }
    }

    return { scheduledCount, workoutIds };
  },
};
