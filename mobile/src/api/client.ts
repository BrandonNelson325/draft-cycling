import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '../stores/useAuthStore';
import { refreshAccessToken } from './tokenRefresh';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Create singleton axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Queue for requests waiting on a token refresh
let waitingQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}> = [];
let refreshingFor401 = false;

function processQueue(error: any, token: string | null = null) {
  waitingQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  waitingQueue = [];
}

// Request interceptor: attach Authorization header
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 and token refresh
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config;

    // Log all API errors for debugging
    if (error.response) {
      console.warn(
        `[API] ${error.response.status} ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url}`,
        error.response.data?.error || ''
      );
    } else if (error.request) {
      console.warn(`[API] Network error: ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url}`, error.message);
    }

    const isAuthEndpoint = originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (refreshingFor401) {
        // Another 401 handler is already refreshing — queue this request
        return new Promise((resolve, reject) => {
          waitingQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      refreshingFor401 = true;

      try {
        // Use the shared refresh — if useTokenRefresh already started one,
        // this will join that same promise instead of double-refreshing
        const newToken = await refreshAccessToken();

        if (!newToken) {
          processQueue(new Error('Token refresh failed'), null);
          return Promise.reject(error);
        }

        processQueue(null, newToken);
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        refreshingFor401 = false;
      }
    }

    // Handle 403 — subscription/beta expired.
    // Refresh profile so RootNavigator can redirect to BetaAccessScreen.
    // We treat ALL 403s from non-auth endpoints as subscription issues,
    // since checkSubscription is the only source of 403 in this codebase.
    if (error.response?.status === 403 && !isAuthEndpoint) {
      try {
        // Dynamic import to avoid circular dependency (authService imports client)
        const { authService } = await import('../services/authService');
        await authService.getProfile();
      } catch {
        // If profile refresh also fails, the error still propagates to the screen
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
