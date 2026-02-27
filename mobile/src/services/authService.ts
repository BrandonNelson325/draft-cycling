import apiClient from '../api/client';
import { useAuthStore } from '../stores/useAuthStore';
import type { AuthResponse, Athlete } from '../types/shared';

export const authService = {
  async register(email: string, password: string, full_name?: string) {
    const { data } = await apiClient.post<AuthResponse>('/api/auth/register', {
      email,
      password,
      full_name,
    });

    useAuthStore.getState().setUser(data.user);
    useAuthStore.getState().setTokens(
      data.session.access_token,
      data.session.refresh_token
    );

    return data;
  },

  async login(email: string, password: string) {
    const { data } = await apiClient.post<AuthResponse>('/api/auth/login', {
      email,
      password,
    });

    useAuthStore.getState().setUser(data.user);
    useAuthStore.getState().setTokens(
      data.session.access_token,
      data.session.refresh_token
    );

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
  }) {
    const { data } = await apiClient.put<Athlete>('/api/auth/me', updates);
    useAuthStore.getState().setUser(data);
    return data;
  },
};
