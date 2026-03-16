import apiClient from '../api/client';
import { useAuthStore } from '../stores/useAuthStore';
import type { AuthResponse, Athlete } from '../types/shared';

export const authService = {
  async register(email: string, password: string, full_name?: string, timezone?: string) {
    const { data } = await apiClient.post<AuthResponse>('/api/auth/register', {
      email,
      password,
      full_name,
      timezone,
    });

    if (!data?.session) {
      throw new Error((data as any)?.error || 'Registration failed');
    }

    // Set tokens BEFORE user so API calls have auth ready when navigator renders
    useAuthStore.getState().setTokens(
      data.session.access_token,
      data.session.refresh_token
    );
    useAuthStore.getState().setUser(data.user);

    return data;
  },

  async login(email: string, password: string) {
    const { data } = await apiClient.post<AuthResponse>('/api/auth/login', {
      email,
      password,
    });

    if (!data?.session) {
      throw new Error((data as any)?.error || 'Login failed');
    }

    // Set tokens BEFORE user so API calls have auth ready when navigator renders
    useAuthStore.getState().setTokens(
      data.session.access_token,
      data.session.refresh_token
    );
    useAuthStore.getState().setUser(data.user);

    return data;
  },

  async logout() {
    try {
      await apiClient.post('/api/auth/logout', {});
    } catch {
      // Ignore errors on logout
    }
    useAuthStore.getState().logout();
  },

  async getProfile() {
    const { data } = await apiClient.get<Athlete>('/api/auth/me');
    useAuthStore.getState().setUser(data);
    return data;
  },

  async updateProfile(updates: {
    full_name?: string;
    ftp?: number;
    weight_kg?: number;
    unit_system?: 'metric' | 'imperial';
    display_mode?: 'simple' | 'advanced';
    experience_level?: 'beginner' | 'intermediate' | 'advanced';
    weekly_training_hours?: number;
    push_notifications_enabled?: boolean;
    morning_checkin_time?: string;
    timezone?: string;
    max_hr?: number;
    resting_hr?: number;
    date_of_birth?: string;
  }) {
    const { data } = await apiClient.put<Athlete>('/api/auth/me', updates);
    useAuthStore.getState().setUser(data);
    return data;
  },
};
