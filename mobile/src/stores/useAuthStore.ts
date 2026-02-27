import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStoreAdapter } from '../utils/storage';
import type { Athlete } from '../types/shared';

interface AuthState {
  user: Athlete | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
  hydrated: boolean;

  setUser: (user: Athlete | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  clearError: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      loading: false,
      error: null,
      hydrated: false,

      setUser: (user) => set({ user }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          error: null,
        }),

      clearError: () => set({ error: null }),

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStoreAdapter),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);
