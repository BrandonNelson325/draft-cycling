import { api } from './api';
import type { AuthResponse, Athlete } from '../types/shared';
import { useAuthStore } from '../stores/useAuthStore';

export const authService = {
  async register(email: string, password: string, full_name?: string) {
    const { data, error } = await api.post<AuthResponse>('/api/auth/register', {
      email,
      password,
      full_name,
    });

    if (error) {
      throw new Error(error.error || 'Registration failed');
    }

    if (data) {
      useAuthStore.getState().setUser(data.user);
      useAuthStore.getState().setTokens(
        data.session.access_token,
        data.session.refresh_token
      );
    }

    return data;
  },

  async login(email: string, password: string) {
    const { data, error } = await api.post<AuthResponse>('/api/auth/login', {
      email,
      password,
    });

    if (error) {
      throw new Error(error.error || 'Login failed');
    }

    if (data) {
      useAuthStore.getState().setUser(data.user);
      useAuthStore.getState().setTokens(
        data.session.access_token,
        data.session.refresh_token
      );
    }

    return data;
  },

  async logout() {
    await api.post('/api/auth/logout', {}, true);
    useAuthStore.getState().logout();
  },

  async getProfile() {
    const { data, error } = await api.get<Athlete>('/api/auth/me', true);

    if (error) {
      throw new Error(error.error || 'Failed to fetch profile');
    }

    if (data) {
      useAuthStore.getState().setUser(data);
    }

    return data;
  },

  async updateProfile(updates: { full_name?: string; ftp?: number; weight_kg?: number; unit_system?: 'metric' | 'imperial' }) {
    const { data, error } = await api.put<Athlete>('/api/auth/me', updates, true);

    if (error) {
      throw new Error(error.error || 'Failed to update profile');
    }

    if (data) {
      useAuthStore.getState().setUser(data);
    }

    return data;
  },
};
