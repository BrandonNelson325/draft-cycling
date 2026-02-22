import { api } from './api';

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
  power?: number; // % of FTP
  power_low?: number; // For ramps
  power_high?: number; // For ramps
  type: IntervalType;
  cadence?: number;
  repeat?: number;
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
}

export interface WorkoutFilters {
  type?: WorkoutType;
  ai_generated?: boolean;
  min_duration?: number;
  max_duration?: number;
}

export const workoutService = {
  /**
   * Create a new workout
   */
  async createWorkout(data: CreateWorkoutDTO): Promise<Workout> {
    const { data: workout, error } = await api.post<Workout>('/api/workouts', data, true);

    if (error) {
      throw new Error(error.error || 'Failed to create workout');
    }

    return workout!;
  },

  /**
   * Get all workouts with optional filters
   */
  async getWorkouts(filters?: WorkoutFilters): Promise<Workout[]> {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.ai_generated !== undefined)
      params.append('ai_generated', filters.ai_generated.toString());
    if (filters?.min_duration) params.append('min_duration', filters.min_duration.toString());
    if (filters?.max_duration) params.append('max_duration', filters.max_duration.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/api/workouts?${queryString}` : '/api/workouts';

    const { data, error } = await api.get<Workout[]>(endpoint, true);

    if (error) {
      throw new Error(error.error || 'Failed to fetch workouts');
    }

    return data || [];
  },

  /**
   * Get a single workout by ID
   */
  async getWorkout(id: string): Promise<Workout> {
    const { data, error } = await api.get<Workout>(`/api/workouts/${id}`, true);

    if (error) {
      throw new Error(error.error || 'Failed to fetch workout');
    }

    return data!;
  },

  /**
   * Update a workout
   */
  async updateWorkout(id: string, data: Partial<CreateWorkoutDTO>): Promise<Workout> {
    const { data: workout, error } = await api.put<Workout>(`/api/workouts/${id}`, data, true);

    if (error) {
      throw new Error(error.error || 'Failed to update workout');
    }

    return workout!;
  },

  /**
   * Delete a workout
   */
  async deleteWorkout(id: string): Promise<void> {
    const { error } = await api.delete(`/api/workouts/${id}`, true);

    if (error) {
      throw new Error(error.error || 'Failed to delete workout');
    }
  },

  /**
   * Download workout as .zwo file
   */
  async downloadZWO(id: string, name: string): Promise<void> {
    const token = (await import('../stores/useAuthStore')).useAuthStore.getState().accessToken;
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    const response = await fetch(`${apiUrl}/api/workouts/${id}/export/zwo`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download ZWO file');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]/gi, '_')}.zwo`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  /**
   * Download workout as .fit file
   */
  async downloadFIT(id: string, name: string): Promise<void> {
    const token = (await import('../stores/useAuthStore')).useAuthStore.getState().accessToken;
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    const response = await fetch(`${apiUrl}/api/workouts/${id}/export/fit`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download FIT file');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]/gi, '_')}.fit`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};
