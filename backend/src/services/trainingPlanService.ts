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

/**
 * Minimum workout duration based on weekly hours target.
 * Athletes committing 8+ hours/week are not beginners — they won't ride < 60 min.
 * Athletes at 4-6 hours/week may accept shorter rides.
 * True beginners (< 4 hours) can have shorter rides.
 */
function getMinDuration(weeklyHours: number): number {
  if (weeklyHours >= 7) return 60;   // Committed riders: 60 min minimum
  if (weeklyHours >= 4) return 45;   // Developing riders: 45 min minimum
  return 30;                          // Beginners: 30 min minimum
}

/**
 * Enforce minimum duration on a workout and scale intervals proportionally.
 */
function enforceMinDuration(workout: WorkoutTemplate, minDuration: number): WorkoutTemplate {
  if (workout.duration_minutes >= minDuration) return workout;
  return { ...workout, duration_minutes: minDuration };
}

/**
 * Scale workout durations so the week's total hours match the target weekly hours.
 * Preserves relative proportions (long ride stays longest, recovery stays shortest).
 */
function scaleToWeeklyHours(workouts: WorkoutTemplate[], targetHours: number, minDuration: number, isRecoveryWeek: boolean, loadingMultiplier: number = 1.0): WorkoutTemplate[] {
  if (workouts.length === 0) return workouts;

  // Recovery weeks: 60-65% of normal volume (easy)
  // Loading weeks: scaled by loadingMultiplier for progressive overload (hard)
  const effectiveTarget = isRecoveryWeek ? targetHours * 0.65 : targetHours * loadingMultiplier;
  const targetMinutes = effectiveTarget * 60;
  const currentTotal = workouts.reduce((sum, w) => sum + w.duration_minutes, 0);

  if (currentTotal === 0) return workouts;

  const scale = targetMinutes / currentTotal;

  return workouts.map(w => {
    const scaled = Math.round(w.duration_minutes * scale);
    // Round to nearest 5 minutes for clean durations
    const rounded = Math.round(Math.max(scaled, minDuration) / 5) * 5;
    return enforceMinDuration({ ...w, duration_minutes: rounded }, minDuration);
  });
}

export const trainingPlanService = {
  /**
   * Generate a complete training plan
   */
  async generatePlan(athleteId: string, config: TrainingPlanConfig): Promise<TrainingPlan> {
    // Get athlete's current FTP and training goal
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp, training_goal, timezone')
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
      start_date: (() => {
        try {
          return new Intl.DateTimeFormat('en-CA', { timeZone: athlete.timezone || 'America/Los_Angeles' }).format(new Date());
        } catch { return new Date().toISOString().split('T')[0]; }
      })(),
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
        peak: Math.floor(totalWeeks * 0.15),
        taper: Math.max(2, Math.floor(totalWeeks * 0.15)), // 2 weeks min for endurance events
      };
    } else if (totalWeeks >= 8) {
      // Short plan
      return {
        base: Math.floor(totalWeeks * 0.25),
        build: Math.floor(totalWeeks * 0.4),
        peak: Math.floor(totalWeeks * 0.15),
        taper: 2, // 2 weeks taper even for short plans
      };
    } else {
      // Very short plan (4-7 weeks)
      return {
        base: Math.floor(totalWeeks * 0.25),
        build: Math.floor(totalWeeks * 0.45),
        peak: Math.floor(totalWeeks * 0.15),
        taper: Math.max(1, Math.min(2, totalWeeks - 3)), // At least 1 week, 2 if room
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
    const minDuration = getMinDuration(config.weekly_hours);

    // Base phase — 4-week blocks: 3 loading + 1 recovery
    // Loading weeks progressively ramp: 100% → 107% → 115% of target hours
    for (let i = 0; i < phases.base; i++) {
      const isRecoveryWeek = (i + 1) % 4 === 0;
      const positionInBlock = i % 4; // 0, 1, 2 = loading; 3 = recovery
      // Progressive overload: each loading week in the block gets harder
      const loadingMultiplier = isRecoveryWeek ? 1.0 : 1.0 + positionInBlock * 0.07; // 1.0, 1.07, 1.14
      const weeklyTSS = isRecoveryWeek ? currentCTL * 5 : currentCTL * (7 + positionInBlock * 0.5); // 7, 7.5, 8
      const rawWorkouts = this.generateBasePhaseWorkouts(ftp, weeklyTSS, config, restDays);
      const workouts = scaleToWeeklyHours(rawWorkouts, config.weekly_hours, minDuration, isRecoveryWeek, loadingMultiplier);

      weeks.push({
        week_number: weekNumber++,
        phase: 'base',
        tss: Math.round(weeklyTSS),
        workouts,
        notes: isRecoveryWeek ? 'Recovery week - reduce volume' : (positionInBlock === 2 ? 'Hard week - peak loading before recovery' : undefined),
      });

      if (!isRecoveryWeek) {
        currentCTL *= 1.05;
      }
    }

    // Build phase — 3-week blocks: 2 loading + 1 recovery
    // Loading weeks ramp harder: 105% → 115% of target hours
    for (let i = 0; i < phases.build; i++) {
      const isRecoveryWeek = (i + 1) % 3 === 0;
      const positionInBlock = i % 3; // 0, 1 = loading; 2 = recovery
      // Build phase pushes harder than base: starts at 105%, peaks at 115%
      const loadingMultiplier = isRecoveryWeek ? 1.0 : 1.05 + positionInBlock * 0.10; // 1.05, 1.15
      const weeklyTSS = isRecoveryWeek ? currentCTL * 5 : currentCTL * (7.5 + positionInBlock * 0.5); // 7.5, 8.0
      const rawWorkouts = this.generateBuildPhaseWorkouts(ftp, weeklyTSS, config, restDays);
      const workouts = scaleToWeeklyHours(rawWorkouts, config.weekly_hours, minDuration, isRecoveryWeek, loadingMultiplier);

      weeks.push({
        week_number: weekNumber++,
        phase: 'build',
        tss: Math.round(weeklyTSS),
        workouts,
        notes: isRecoveryWeek ? 'Recovery week - maintain intensity, reduce volume' : (positionInBlock === 1 ? 'Hard week - peak loading before recovery' : undefined),
      });

      if (!isRecoveryWeek) {
        currentCTL *= 1.08;
      }
    }

    // Peak phase — high intensity, volume at 105-110% to push limits
    for (let i = 0; i < phases.peak; i++) {
      const loadingMultiplier = 1.05 + (i / Math.max(phases.peak - 1, 1)) * 0.05; // 1.05 → 1.10
      const weeklyTSS = currentCTL * 7.5;
      const rawWorkouts = this.generatePeakPhaseWorkouts(ftp, weeklyTSS, config, restDays);
      const workouts = scaleToWeeklyHours(rawWorkouts, config.weekly_hours, minDuration, false, loadingMultiplier);

      weeks.push({
        week_number: weekNumber++,
        phase: 'peak',
        tss: Math.round(weeklyTSS),
        workouts,
        notes: 'High intensity work - pushing limits',
      });
    }

    // Taper phase — intentionally lower volume (50-60% of normal)
    for (let i = 0; i < phases.taper; i++) {
      const taperFactor = 0.5 - i * 0.1; // 50%, 40%, 30%...
      const weeklyTSS = currentCTL * 7 * taperFactor;
      const rawWorkouts = this.generateTaperPhaseWorkouts(ftp, weeklyTSS, config, restDays);
      // Taper uses reduced hours by design, but still enforce min duration
      const taperHours = config.weekly_hours * Math.max(taperFactor, 0.3);
      const workouts = scaleToWeeklyHours(rawWorkouts, taperHours, minDuration, false);

      weeks.push({
        week_number: weekNumber++,
        phase: 'taper',
        tss: Math.round(weeklyTSS),
        workouts,
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
        duration_minutes: 60,
        day_of_week: availableDays[dayIndex++],
        intervals: [{ duration: 3600, power: 55, type: 'work' }],
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

    // Available training days (excluding rest days) — maintain training frequency
    const availableDays = [2, 4, 5, 1, 3, 6, 0].filter(day => !restDayNumbers.includes(day));

    if (availableDays.length === 0) return [];

    let dayIndex = 0;

    // 1. Threshold maintenance — reduced volume, same intensity
    workouts.push({
      name: 'Threshold Sharpener',
      description: 'Maintain FTP with reduced volume — 3x8min at threshold with full recovery',
      workout_type: 'threshold',
      duration_minutes: 60,
      day_of_week: availableDays[dayIndex++ % availableDays.length],
      intervals: [
        { duration: 600, power: 65, type: 'warmup' },
        { duration: 480, power: 100, type: 'work', repeat: 3 },
        { duration: 300, power: 55, type: 'rest', repeat: 3 },
        { duration: 300, power: 55, type: 'cooldown' },
      ],
      rationale: 'Maintain threshold fitness without generating fatigue. Reduce volume, keep intensity.',
    });

    // 2. Easy endurance — shorter than normal
    if (dayIndex < availableDays.length) {
      workouts.push({
        name: 'Easy Endurance',
        description: 'Reduced-volume Z2 ride to maintain aerobic base',
        workout_type: 'endurance',
        duration_minutes: 75,
        day_of_week: availableDays[dayIndex++ % availableDays.length],
        intervals: [{ duration: 4500, power: 65, type: 'work' }],
        rationale: 'Maintain aerobic fitness with reduced volume. Keep legs turning over.',
      });
    }

    // 3. VO2max openers — short and sharp
    if (dayIndex < availableDays.length) {
      workouts.push({
        name: 'Race Openers',
        description: 'Short high-intensity efforts to keep neuromuscular systems sharp',
        workout_type: 'vo2max',
        duration_minutes: 50,
        day_of_week: availableDays[dayIndex++ % availableDays.length],
        intervals: [
          { duration: 600, power: 65, type: 'warmup' },
          { duration: 120, power: 115, type: 'work', repeat: 4 },
          { duration: 240, power: 55, type: 'rest', repeat: 4 },
          { duration: 30, power: 150, type: 'work', repeat: 2 },
          { duration: 180, power: 50, type: 'rest', repeat: 2 },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
        rationale: 'VO2max bursts + sprints to stay sharp. NOT fatiguing — think reminders, not workouts.',
      });
    }

    // 4. Easy spin — active recovery
    if (dayIndex < availableDays.length) {
      workouts.push({
        name: 'Easy Spin',
        description: 'Very easy recovery ride with high cadence',
        workout_type: 'recovery',
        duration_minutes: 45,
        day_of_week: availableDays[dayIndex++ % availableDays.length],
        intervals: [{ duration: 2700, power: 50, type: 'work' }],
        rationale: 'Active recovery — flush legs, maintain neuromuscular patterns.',
      });
    }

    // 5. Pre-race activation (2 days before race day)
    if (dayIndex < availableDays.length) {
      workouts.push({
        name: 'Pre-Race Activation',
        description: 'Final tune-up: warmup, race-pace openers, cool down',
        workout_type: 'custom',
        duration_minutes: 45,
        day_of_week: availableDays[dayIndex++ % availableDays.length],
        intervals: [
          { duration: 600, power: 60, type: 'warmup' },
          { duration: 60, power: 115, type: 'work', repeat: 4 },
          { duration: 120, power: 55, type: 'rest', repeat: 4 },
          { duration: 30, power: 150, type: 'work', repeat: 2 },
          { duration: 120, power: 50, type: 'rest', repeat: 2 },
          { duration: 300, power: 55, type: 'cooldown' },
        ],
        rationale: 'Activate all systems without generating fatigue. Arrive at start line sharp.',
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
   * Get all active training plans for athlete, sorted by start_date ascending (soonest first)
   */
  async getActivePlans(athleteId: string): Promise<TrainingPlan[]> {
    const { data, error } = await supabaseAdmin
      .from('training_plans')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .order('start_date', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((d: any) => ({
      id: d.id,
      athlete_id: d.athlete_id,
      goal_event: d.goal_event,
      event_date: d.event_date,
      start_date: d.start_date,
      weeks: d.weeks,
      total_tss: d.total_tss,
      created_at: d.created_at,
    }));
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
   * Delete training plan. Optionally remove associated calendar entries and workouts.
   */
  async deletePlan(planId: string, athleteId: string, removeWorkouts: boolean = false): Promise<{ removedCount: number }> {
    let removedCount = 0;

    if (removeWorkouts) {
      // Delete calendar entries linked to this plan first (FK constraint)
      const { data: deletedEntries } = await supabaseAdmin
        .from('calendar_entries')
        .delete()
        .eq('training_plan_id', planId)
        .select('id');

      removedCount = deletedEntries?.length || 0;

      // Delete workouts linked to this plan
      await supabaseAdmin
        .from('workouts')
        .delete()
        .eq('training_plan_id', planId)
        .eq('athlete_id', athleteId);
    }

    const { error } = await supabaseAdmin
      .from('training_plans')
      .update({ status: 'cancelled' })
      .eq('id', planId)
      .eq('athlete_id', athleteId);

    if (error) {
      throw new Error(`Failed to delete training plan: ${error.message}`);
    }

    return { removedCount };
  },

  /**
   * Schedule training plan to calendar
   */
  async schedulePlanToCalendar(
    athleteId: string,
    plan: TrainingPlan
  ): Promise<{ scheduledCount: number; workoutIds: string[] }> {
    const startDate = new Date(plan.start_date);

    // Flatten all week+workout combos so we can work with them as a flat list
    const items = plan.weeks.flatMap((week) =>
      week.workouts.map((wt) => ({ week, wt }))
    );

    // Step 1: Create all workouts in parallel (was sequential — big speedup for 20+ workout plans)
    const createdWorkouts = await Promise.all(
      items.map(({ week, wt }) =>
        workoutService.createWorkout(athleteId, {
          name: wt.name,
          description: wt.description,
          workout_type: wt.workout_type as any,
          duration_minutes: wt.duration_minutes,
          intervals: wt.intervals,
          generated_by_ai: true,
          ai_prompt: `Training plan: ${plan.goal_event} - Week ${week.week_number} (${week.phase} phase)`,
          training_plan_id: plan.id,
        })
      )
    );

    // Step 2: Schedule all calendar entries in parallel
    await Promise.all(
      createdWorkouts.map((workout, i) => {
        const { week, wt } = items[i];
        const weekOffset = week.week_number - 1;
        const scheduledDate = new Date(startDate);
        scheduledDate.setDate(scheduledDate.getDate() + weekOffset * 7 + wt.day_of_week);

        return calendarService.scheduleWorkout(
          athleteId,
          workout.id,
          scheduledDate,
          wt.rationale || `Week ${week.week_number} - ${week.phase} phase: ${wt.name}`,
          plan.id,
          week.week_number
        );
      })
    );

    return {
      scheduledCount: createdWorkouts.length,
      workoutIds: createdWorkouts.map((w) => w.id),
    };
  },
};
