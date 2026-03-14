import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import { refreshIfNeeded } from '../api/tokenRefresh';

/**
 * Proactively refreshes the auth token:
 * 1. When the app returns to foreground
 * 2. On a periodic timer (every 45 minutes)
 *
 * Sets tokenReady=true once the initial refresh check completes,
 * so dashboard components know it's safe to fetch data.
 */
export function useTokenRefresh() {
  const { user } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    // Refresh on mount, then mark token as ready
    const init = async () => {
      try {
        await refreshIfNeeded();
      } catch {
        // refreshIfNeeded handles logout internally
      }
      // Mark ready whether refresh succeeded or token was already valid
      useAuthStore.getState().setTokenReady(true);
    };
    init();

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
