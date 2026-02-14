import { useAuthStore } from '../stores/useAuthStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
}

class ApiClient {
  private baseUrl: string;

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

  async request<T>(
    endpoint: string,
    options: RequestOptions = {}
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
