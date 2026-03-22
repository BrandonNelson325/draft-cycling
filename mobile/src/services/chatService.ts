import apiClient from '../api/client';
import { useAuthStore } from '../stores/useAuthStore';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  athlete_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface StreamCallbacks {
  onStart: (conversationId: string) => void;
  onToken: (text: string) => void;
  onProgress: (message: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

const API_URL = __DEV__
  ? 'http://localhost:3000'
  : (process.env.EXPO_PUBLIC_API_URL || 'https://api.draftcycling.com');

export const chatService = {
  async getConversations(): Promise<ChatConversation[]> {
    const { data } = await apiClient.get<{ conversations: ChatConversation[] }>(
      '/api/ai/conversations'
    );
    return data?.conversations || [];
  },

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const { data } = await apiClient.get<{ messages: ChatMessage[] }>(
      `/api/ai/conversations/${conversationId}/messages`
    );
    return data?.messages || [];
  },

  /**
   * Stream chat messages using XMLHttpRequest (React Native compatible).
   * RN's fetch() does not support ReadableStream/getReader(), so we use XHR
   * with progressive responseText reading to parse SSE events.
   */
  sendMessageStream(
    message: string,
    conversationId: string | null | undefined,
    callbacks: StreamCallbacks
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const user = useAuthStore.getState().user;
      const token = useAuthStore.getState().accessToken;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/api/ai/chat/stream`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      let lastIndex = 0;

      xhr.onprogress = () => {
        const newText = xhr.responseText.substring(lastIndex);
        lastIndex = xhr.responseText.length;

        const lines = newText.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            switch (event.type) {
              case 'start':
                callbacks.onStart(event.conversation_id);
                break;
              case 'token':
                callbacks.onToken(event.text);
                break;
              case 'progress':
                callbacks.onProgress(event.message || 'Working on it...');
                break;
              case 'done':
                callbacks.onDone();
                break;
              case 'error':
                callbacks.onError(event.error);
                break;
            }
          } catch {
            // Skip malformed events
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let errorMsg = 'Failed to send message';
          try {
            const errData = JSON.parse(xhr.responseText);
            errorMsg = errData.error || errorMsg;
          } catch {}
          callbacks.onError(errorMsg);
          reject(new Error(errorMsg));
        }
      };

      xhr.onerror = () => {
        callbacks.onError('Network error. Please try again.');
        reject(new Error('Network error'));
      };

      xhr.ontimeout = () => {
        callbacks.onError('Request timed out. Please try again.');
        reject(new Error('Timeout'));
      };

      // No timeout — streaming can take as long as needed
      xhr.timeout = 0;

      xhr.send(JSON.stringify({
        message,
        conversation_id: conversationId || null,
        client_date: new Date().toLocaleDateString('en-CA'),
        display_mode: user?.display_mode ?? 'advanced',
      }));
    });
  },

  /** Non-streaming fallback — used if streaming fails */
  async sendMessage(message: string, conversationId?: string): Promise<{ message: ChatMessage; conversation_id: string }> {
    const user = useAuthStore.getState().user;
    const { data } = await apiClient.post<{ message: ChatMessage; conversation_id: string }>('/api/ai/chat', {
      message,
      conversation_id: conversationId,
      client_date: new Date().toLocaleDateString('en-CA'),
      display_mode: user?.display_mode ?? 'advanced',
    }, {
      timeout: 180000, // 3 minutes for non-streaming fallback
    });
    return data;
  },

  async startConversation(): Promise<{ conversation_id: string; message: ChatMessage }> {
    const { data } = await apiClient.post<{
      conversation_id: string;
      message: ChatMessage;
    }>('/api/ai/start-conversation', {}, {
      timeout: 120000,
    });
    return data;
  },

  async deleteConversation(conversationId: string): Promise<void> {
    await apiClient.delete(`/api/ai/conversations/${conversationId}`);
  },
};
