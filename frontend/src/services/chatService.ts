import { api } from './api';
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
};
