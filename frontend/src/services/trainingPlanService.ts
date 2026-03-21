import { api } from './api';
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
    const { data, error } = await api.get<{ plan: TrainingPlan }>('/api/training-plans/active', true);

    if (error || !data) {
      return null;
    }

    return data.plan;
  },

  async getActivePlans(): Promise<TrainingPlan[]> {
    const { data, error } = await api.get<{ plans: TrainingPlan[] }>('/api/training-plans/active/all', true);
    if (error || !data) return [];
    return data.plans;
  },

  async getPlanById(planId: string): Promise<TrainingPlan | null> {
    const { data, error } = await api.get<{ plan: TrainingPlan }>(
      `/api/training-plans/${planId}`,
      true
    );

    if (error || !data) {
      return null;
    }

    return data.plan;
  },

  async deletePlan(planId: string, removeWorkouts: boolean = false): Promise<void> {
    const url = `/api/training-plans/${planId}${removeWorkouts ? '?removeWorkouts=true' : ''}`;
    const { error } = await api.delete(url, true);

    if (error) {
      throw new Error(error.error || 'Failed to delete training plan');
    }
  },

  async getTemplates(filters?: { difficulty?: string; search?: string }): Promise<TrainingPlanTemplate[]> {
    const params = new URLSearchParams();
    if (filters?.difficulty) params.set('difficulty', filters.difficulty);
    if (filters?.search) params.set('search', filters.search);
    const qs = params.toString();
    const url = `/api/training-plans/templates${qs ? `?${qs}` : ''}`;
    const { data, error } = await api.get<{ templates: TrainingPlanTemplate[] }>(url, true);
    if (error || !data) return [];
    return data.templates;
  },
};
