import { useAuthStore } from '../stores/useAuthStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
}

class ApiClient {
  private baseUrl: string;
  private refreshing: Promise<boolean> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getHeaders(requireAuth = false): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (requireAuth) {
      const token = useAuthStore.getState().accessToken;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private async refreshToken(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshing) {
      return this.refreshing;
    }

    this.refreshing = (async () => {
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) {
          return false;
        }

        const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
          // Refresh failed, logout user
          useAuthStore.getState().logout();
          return false;
        }

        const data = await response.json();

        // Update tokens in store
        useAuthStore.getState().setTokens(
          data.session.access_token,
          data.session.refresh_token
        );

        return true;
      } catch (error) {
        console.error('Token refresh failed:', error);
        useAuthStore.getState().logout();
        return false;
      } finally {
        this.refreshing = null;
      }
    })();

    return this.refreshing;
  }

  async request<T>(
    endpoint: string,
    options: RequestOptions = {},
    retryCount = 0
  ): Promise<{ data?: T; error?: any }> {
    const { requireAuth = false, ...fetchOptions } = options;

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...fetchOptions,
        headers: {
          ...this.getHeaders(requireAuth),
          ...fetchOptions.headers,
        },
      });

      // If unauthorized and we haven't retried yet, try to refresh token
      if (response.status === 401 && requireAuth && retryCount === 0) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry the original request with new token
          return this.request<T>(endpoint, options, retryCount + 1);
        }
      }

      // Handle 204 No Content (successful delete with no body)
      if (response.status === 204) {
        return { data: undefined as T };
      }

      // Parse JSON response
      const data = await response.json();

      if (!response.ok) {
        return { error: data };
      }

      return { data };
    } catch (error: any) {
      return { error: { message: error.message || 'Network error' } };
    }
  }

  async get<T>(endpoint: string, requireAuth = false) {
    return this.request<T>(endpoint, { method: 'GET', requireAuth });
  }

  async post<T>(endpoint: string, body: any, requireAuth = false) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      requireAuth,
    });
  }

  async put<T>(endpoint: string, body: any, requireAuth = false) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
      requireAuth,
    });
  }

  async delete<T>(endpoint: string, requireAuth = false) {
    return this.request<T>(endpoint, { method: 'DELETE', requireAuth });
  }
}

export const api = new ApiClient(API_URL);
