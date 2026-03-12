import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import { refreshIfNeeded } from '../api/tokenRefresh';

/**
 * Proactively refreshes the auth token:
 * 1. When the app returns to foreground
 * 2. On a periodic timer (every 45 minutes)
 *
 * Uses the shared refreshAccessToken() so it never races with the 401 interceptor.
 */
export function useTokenRefresh() {
  const { user } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    // Refresh on mount (app start / login)
    refreshIfNeeded();

    // Refresh when app comes to foreground
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refreshIfNeeded();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);

    // Periodic refresh every 45 minutes
    intervalRef.current = setInterval(refreshIfNeeded, 45 * 60 * 1000);

    return () => {
      subscription.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id]);
}
