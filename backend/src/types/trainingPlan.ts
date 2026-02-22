export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';
export type TrainingPhase = 'base' | 'build' | 'peak' | 'taper';

export interface TrainingPlanConfig {
  goal_event: string;
  event_date: Date;
  current_fitness_level: FitnessLevel;
  weekly_hours: number;
  strengths: string[];
  weaknesses: string[];
  preferences: {
    indoor_outdoor: 'indoor' | 'outdoor' | 'both';
    zwift_availability: boolean;
  };
}

export interface WorkoutTemplate {
  name: string;
  description: string;
  workout_type: string;
  duration_minutes: number;
  intervals: any[];
  day_of_week: number; // 0 = Sunday, 1 = Monday, etc.
  rationale?: string;
}

export interface TrainingWeek {
  week_number: number;
  phase: TrainingPhase;
  tss: number;
  workouts: WorkoutTemplate[];
  notes?: string;
}

export interface TrainingPlan {
  id: string;
  athlete_id: string;
  goal_event: string;
  event_date: string;
  start_date: string;
  weeks: TrainingWeek[];
  total_tss: number;
  created_at?: string;
}

export interface PhaseDurations {
  base: number;
  build: number;
  peak: number;
  taper: number;
}
