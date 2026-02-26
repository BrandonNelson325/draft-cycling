import { api } from './api';
import { useAuthStore } from '../stores/useAuthStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface StreamCallbacks {
  onStart: (conversationId: string) => void;
  onToken: (text: string) => void;
  onProgress: (message: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

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

export const chatService = {
  async getConversations() {
    const { data, error } = await api.get<{ conversations: ChatConversation[] }>(
      '/api/ai/conversations',
      true
    );

    if (error) {
      throw new Error(error.error || 'Failed to fetch conversations');
    }

    return data?.conversations || [];
  },

  async getMessages(conversationId: string) {
    const { data, error } = await api.get<{ messages: ChatMessage[] }>(
      `/api/ai/conversations/${conversationId}/messages`,
      true
    );

    if (error) {
      throw new Error(error.error || 'Failed to fetch messages');
    }

    return data?.messages || [];
  },

  async sendMessage(message: string, conversationId?: string) {
    const user = useAuthStore.getState().user;
    const { data, error } = await api.post<SendMessageResponse>(
      '/api/ai/chat',
      {
        message,
        conversation_id: conversationId,
        client_date: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD in local time
        display_mode: user?.display_mode ?? 'advanced',
      },
      true
    );

    if (error) {
      console.error('Chat service error:', error);
      throw new Error(error.error || 'Failed to send message');
    }

    if (!data) {
      throw new Error('No data returned from server');
    }

    return data;
  },

  async startConversation() {
    const { data, error } = await api.post<{
      conversation_id: string;
      message: ChatMessage;
    }>('/api/ai/start-conversation', {}, true);

    if (error) {
      console.error('Start conversation error:', error);
      throw new Error(error.error || 'Failed to start conversation');
    }

    return data!;
  },

  async deleteConversation(conversationId: string) {
    const { error } = await api.delete(`/api/ai/conversations/${conversationId}`, true);

    if (error) {
      throw new Error(error.error || 'Failed to delete conversation');
    }
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
};
