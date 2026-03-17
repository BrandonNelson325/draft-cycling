import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import { refreshIfNeeded } from '../api/tokenRefresh';
import { authService } from '../services/authService';

/**
 * Proactively refreshes the auth token AND user profile:
 * 1. When the app first opens (mount)
 * 2. When the app returns to foreground
 * 3. On a periodic timer (every 45 minutes) for the token
 *
 * Sets tokenReady=true once the initial refresh check completes,
 * so dashboard components know it's safe to fetch data.
 */
export function useTokenRefresh() {
  const { user } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    // Refresh token and profile on mount, then mark ready
    const init = async () => {
      try {
        await refreshIfNeeded();
      } catch {
        // refreshIfNeeded handles logout internally
      }
      // Always refresh the user profile so subscription/beta status is current.
      // This ensures RootNavigator's nav gate reflects server-side truth.
      try {
        await authService.getProfile();
      } catch {
        // Non-fatal — profile stays as cached. If token is invalid,
        // the 401 interceptor will have already handled logout.
      }
      useAuthStore.getState().setTokenReady(true);
    };
    init();

    // Refresh when app comes to foreground
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refreshIfNeeded();
        // Fire-and-forget profile refresh on foreground (non-blocking)
        authService.getProfile().catch(() => {});
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);

    // Periodic token refresh every 45 minutes
    intervalRef.current = setInterval(refreshIfNeeded, 45 * 60 * 1000);

    return () => {
      subscription.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id]);
}
