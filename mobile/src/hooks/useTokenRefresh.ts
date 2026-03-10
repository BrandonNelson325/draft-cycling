import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import axios from 'axios';
import { useAuthStore } from '../stores/useAuthStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Decode JWT exp without a library (JWTs are base64url-encoded)
function getTokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.exp ? decoded.exp * 1000 : null; // Convert to ms
  } catch {
    return null;
  }
}

async function refreshIfNeeded(): Promise<void> {
  const { accessToken, refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!accessToken || !refreshToken) return;

  const expiry = getTokenExpiry(accessToken);
  if (!expiry) return;

  // Refresh if token expires within the next 5 minutes
  const fiveMinutes = 5 * 60 * 1000;
  if (expiry - Date.now() > fiveMinutes) return;

  try {
    const response = await axios.post(`${API_URL}/api/auth/refresh`, {
      refresh_token: refreshToken,
    });
    const { access_token, refresh_token } = response.data.session;
    setTokens(access_token, refresh_token);
  } catch (err: any) {
    const status = err?.response?.status;
    // Only logout on permanent auth failure, not transient errors
    if (status === 401 || status === 403) {
      console.warn('[TokenRefresh] Refresh token invalid, logging out');
      logout();
    } else {
      console.warn('[TokenRefresh] Transient refresh error, will retry later:', err?.message);
    }
  }
}

/**
 * Proactively refreshes the auth token:
 * 1. When the app returns to foreground
 * 2. On a periodic timer (every 45 minutes)
 *
 * This prevents 401s during normal use — users stay logged in
 * as long as they open the app at least once before the refresh token expires.
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

    // Periodic refresh every 45 minutes (well before the typical 1hr expiry)
    intervalRef.current = setInterval(refreshIfNeeded, 45 * 60 * 1000);

    return () => {
      subscription.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id]);
}
