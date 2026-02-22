export type WorkoutType =
  | 'endurance'
  | 'tempo'
  | 'threshold'
  | 'vo2max'
  | 'sprint'
  | 'recovery'
  | 'custom';

export type IntervalType = 'warmup' | 'work' | 'rest' | 'cooldown' | 'ramp';

export interface WorkoutInterval {
  duration: number; // seconds
  power?: number; // % of FTP (e.g., 85 for 85%)
  power_low?: number; // For ramps, starting power % FTP
  power_high?: number; // For ramps, ending power % FTP
  type: IntervalType;
  cadence?: number; // Target cadence (optional)
  repeat?: number; // Number of times to repeat this interval
}

export interface Workout {
  id: string;
  athlete_id: string;
  name: string;
  description?: string;
  workout_type: WorkoutType;
  duration_minutes: number;
  tss?: number;
  intervals: WorkoutInterval[];
  zwo_file_url?: string;
  fit_file_url?: string;
  generated_by_ai: boolean;
  ai_prompt?: string;
  training_plan_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface CreateWorkoutDTO {
  name: string;
  description?: string;
  workout_type: WorkoutType;
  duration_minutes: number;
  intervals: WorkoutInterval[];
  generated_by_ai?: boolean;
  ai_prompt?: string;
  training_plan_id?: string;
}

export interface UpdateWorkoutDTO {
  name?: string;
  description?: string;
  workout_type?: WorkoutType;
  duration_minutes?: number;
  tss?: number;
  intervals?: WorkoutInterval[];
  zwo_file_url?: string;
  fit_file_url?: string;
}

export interface WorkoutFilters {
  workout_type?: WorkoutType;
  ai_generated?: boolean;
  min_duration?: number;
  max_duration?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
