import { Workout } from './workout';

export interface CalendarEntry {
  id: string;
  athlete_id: string;
  workout_id: string;
  scheduled_date: string; // Date in YYYY-MM-DD format
  completed: boolean;
  completed_at?: string;
  notes?: string;
  ai_rationale?: string;
  strava_activity_id?: number;
  created_at: string;
  updated_at?: string;
  // Joined workout data
  workouts?: Workout;
}

export interface ScheduleWorkoutDTO {
  workout_id: string;
  scheduled_date: string;
  ai_rationale?: string;
}

export interface UpdateCalendarEntryDTO {
  scheduled_date?: string;
  notes?: string;
  completed?: boolean;
  strava_activity_id?: number;
}

export interface CompleteWorkoutDTO {
  notes?: string;
  strava_activity_id?: number;
}

export interface BulkScheduleDTO {
  entries: {
    workout_id: string;
    scheduled_date: string;
    ai_rationale?: string;
  }[];
}
