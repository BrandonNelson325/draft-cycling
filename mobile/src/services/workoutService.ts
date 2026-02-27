import apiClient from '../api/client';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '../stores/useAuthStore';

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
  duration: number;
  power?: number;
  power_low?: number;
  power_high?: number;
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
  async createWorkout(data: CreateWorkoutDTO): Promise<Workout> {
    const { data: workout } = await apiClient.post<Workout>('/api/workouts', data);
    return workout;
  },

  async getWorkouts(filters?: WorkoutFilters): Promise<Workout[]> {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.ai_generated !== undefined)
      params.append('ai_generated', filters.ai_generated.toString());
    if (filters?.min_duration)
      params.append('min_duration', filters.min_duration.toString());
    if (filters?.max_duration)
      params.append('max_duration', filters.max_duration.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/api/workouts?${queryString}` : '/api/workouts';
    const { data } = await apiClient.get<Workout[]>(endpoint);
    return data || [];
  },

  async getWorkout(id: string): Promise<Workout> {
    const { data } = await apiClient.get<Workout>(`/api/workouts/${id}`);
    return data;
  },

  async updateWorkout(id: string, updates: Partial<CreateWorkoutDTO>): Promise<Workout> {
    const { data } = await apiClient.put<Workout>(`/api/workouts/${id}`, updates);
    return data;
  },

  async deleteWorkout(id: string): Promise<void> {
    await apiClient.delete(`/api/workouts/${id}`);
  },

  async downloadZWO(id: string, name: string): Promise<void> {
    const token = useAuthStore.getState().accessToken;
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.zwo`;
    const dest = FileSystem.cacheDirectory + filename;

    const result = await FileSystem.downloadAsync(
      `${apiUrl}/api/workouts/${id}/export/zwo`,
      dest,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await Sharing.shareAsync(result.uri);
  },

  async downloadFIT(id: string, name: string): Promise<void> {
    const token = useAuthStore.getState().accessToken;
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    const filename = `${name.replace(/[^a-z0-9]/gi, '_')}.fit`;
    const dest = FileSystem.cacheDirectory + filename;

    const result = await FileSystem.downloadAsync(
      `${apiUrl}/api/workouts/${id}/export/fit`,
      dest,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await Sharing.shareAsync(result.uri);
  },
};
