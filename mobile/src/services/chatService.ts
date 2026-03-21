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

interface SendMessageResponse {
  message: ChatMessage;
  conversation_id: string;
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

  async sendMessageStream(
    message: string,
    conversationId: string | null | undefined,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const user = useAuthStore.getState().user;
    const token = useAuthStore.getState().accessToken;

    const response = await fetch(`${API_URL}/api/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message,
        conversation_id: conversationId || null,
        client_date: new Date().toLocaleDateString('en-CA'),
        display_mode: user?.display_mode ?? 'advanced',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Stream connection failed' }));
      throw new Error(err.error || 'Stream connection failed');
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

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
    }
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
