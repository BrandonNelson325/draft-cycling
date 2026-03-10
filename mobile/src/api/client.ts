import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '../stores/useAuthStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

// Create singleton axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Token refresh queue to handle concurrent 401s
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

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
      originalRequest?.url?.includes('/auth/register');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;

        if (!refreshToken) {
          useAuthStore.getState().logout();
          processQueue(new Error('No refresh token'), null);
          return Promise.reject(error);
        }

        // Attempt refresh with one retry for transient failures
        let lastError: any;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await axios.post(`${API_URL}/api/auth/refresh`, {
              refresh_token: refreshToken,
            });

            const { access_token, refresh_token } = response.data.session;
            useAuthStore.getState().setTokens(access_token, refresh_token);

            processQueue(null, access_token);
            originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
            return apiClient(originalRequest);
          } catch (err: any) {
            lastError = err;
            const status = err?.response?.status;
            // 401/403 from refresh = token permanently invalid, don't retry
            if (status === 401 || status === 403) break;
            // Transient error — wait briefly then retry
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }

        // Only logout if refresh is permanently broken
        console.warn('[API] Token refresh failed, logging out:', lastError?.response?.status || lastError?.message);
        useAuthStore.getState().logout();
        processQueue(lastError, null);
        return Promise.reject(lastError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
