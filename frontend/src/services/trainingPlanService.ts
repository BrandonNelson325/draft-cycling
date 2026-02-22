import { api } from './api';

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

  async deletePlan(planId: string): Promise<void> {
    const { error } = await api.delete(`/api/training-plans/${planId}`, true);

    if (error) {
      throw new Error(error.error || 'Failed to delete training plan');
    }
  },
};
