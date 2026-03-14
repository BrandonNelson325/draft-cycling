import axios from 'axios';
import { useAuthStore } from '../stores/useAuthStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Centralized token refresh logic.
 * Both the 401 interceptor and the proactive useTokenRefresh hook
 * use this so only ONE refresh ever happens at a time.
 */

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;
let waitingQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (error: any) => void;
}> = [];

function drainQueue(error: any, token: string | null) {
  waitingQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token);
  });
  waitingQueue = [];
}

/**
 * Perform a token refresh. If one is already in progress, returns that promise.
 * Returns the new access token on success, or null on permanent failure (logout).
 */
export async function refreshAccessToken(): Promise<string | null> {
  // If already refreshing, queue up
  if (isRefreshing) {
    return new Promise<string | null>((resolve, reject) => {
      waitingQueue.push({ resolve, reject });
    });
  }

  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) {
    logout();
    return null;
  }

  isRefreshing = true;

  try {
    // Retry with backoff for transient failures
    let lastError: any;
    let wasRateLimited = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await axios.post(`${API_URL}/api/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token } = response.data.session;
        setTokens(access_token, refresh_token);
        drainQueue(null, access_token);
        return access_token;
      } catch (err: any) {
        lastError = err;
        const status = err?.response?.status;
        // 401/403 = token permanently invalid, stop retrying
        if (status === 401 || status === 403) break;
        // 429 = rate limited — back off and retry, NEVER logout for rate limits
        if (status === 429) {
          wasRateLimited = true;
          await new Promise((r) => setTimeout(r, (attempt + 1) * 5000));
          continue;
        }
        // Other transient errors — wait briefly then retry
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }

    // Rate limit is transient — do NOT logout, just fail silently
    // The token is still valid, just couldn't refresh right now
    if (wasRateLimited) {
      console.warn('[TokenRefresh] Rate limited, will retry later (NOT logging out)');
      drainQueue(lastError, null);
      return null;
    }

    // Only logout for permanent auth failures (401/403)
    console.warn('[TokenRefresh] Refresh failed, logging out:', lastError?.response?.status || lastError?.message);
    logout();
    drainQueue(lastError, null);
    return null;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

/**
 * Check if access token is close to expiry and refresh proactively.
 * Does nothing if token is still fresh.
 */
export async function refreshIfNeeded(): Promise<void> {
  const { accessToken, refreshToken } = useAuthStore.getState();
  if (!accessToken || !refreshToken) return;

  const expiry = getTokenExpiry(accessToken);
  if (!expiry) return;

  // Refresh if token expires within 5 minutes
  const fiveMinutes = 5 * 60 * 1000;
  if (expiry - Date.now() > fiveMinutes) return;

  await refreshAccessToken();
}

function getTokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.exp ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isCurrentlyRefreshing(): boolean {
  return isRefreshing;
}
