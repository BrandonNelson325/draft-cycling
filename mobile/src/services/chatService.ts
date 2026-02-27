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

  async sendMessage(message: string, conversationId?: string): Promise<SendMessageResponse> {
    const user = useAuthStore.getState().user;
    const { data } = await apiClient.post<SendMessageResponse>('/api/ai/chat', {
      message,
      conversation_id: conversationId,
      client_date: new Date().toLocaleDateString('en-CA'),
      display_mode: user?.display_mode ?? 'advanced',
    });
    return data;
  },

  async startConversation(): Promise<{ conversation_id: string; message: ChatMessage }> {
    const { data } = await apiClient.post<{
      conversation_id: string;
      message: ChatMessage;
    }>('/api/ai/start-conversation', {});
    return data;
  },

  async deleteConversation(conversationId: string): Promise<void> {
    await apiClient.delete(`/api/ai/conversations/${conversationId}`);
  },
};
