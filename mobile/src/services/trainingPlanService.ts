import apiClient from '../api/client';
import type { TrainingPlanTemplate } from '../types/shared';

export interface TrainingWeek {
  week_number: number;
  phase: 'base' | 'build' | 'peak' | 'taper';
  tss: number;
  workouts: WorkoutTemplate[];
  notes?: string;
}

export interface WorkoutTemplate {
  name: string;
  description: string;
  workout_type: string;
  duration_minutes: number;
  intervals: any[];
  day_of_week: number;
  rationale?: string;
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

export const trainingPlanService = {
  async getActivePlan(): Promise<TrainingPlan | null> {
    try {
      const { data } = await apiClient.get<{ plan: TrainingPlan }>('/api/training-plans/active');
      return data?.plan || null;
    } catch {
      return null;
    }
  },

  async getPlanById(planId: string): Promise<TrainingPlan | null> {
    try {
      const { data } = await apiClient.get<{ plan: TrainingPlan }>(
        `/api/training-plans/${planId}`
      );
      return data?.plan || null;
    } catch {
      return null;
    }
  },

  async deletePlan(planId: string): Promise<void> {
    await apiClient.delete(`/api/training-plans/${planId}`);
  },

  async getTemplates(filters?: { difficulty?: string; search?: string }): Promise<TrainingPlanTemplate[]> {
    const params = new URLSearchParams();
    if (filters?.difficulty) params.set('difficulty', filters.difficulty);
    if (filters?.search) params.set('search', filters.search);
    const qs = params.toString();
    const { data } = await apiClient.get<{ templates: TrainingPlanTemplate[] }>(
      `/api/training-plans/templates${qs ? `?${qs}` : ''}`
    );
    return data?.templates || [];
  },
};
