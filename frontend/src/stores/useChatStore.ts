import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chatService, type ChatMessage, type ChatConversation } from '../services/chatService';

interface ChatStore {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  loading: boolean;

  loadConversations: () => Promise<void>;
  selectConversation: (id: string) => void;
  sendMessage: (message: string) => Promise<void>;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  clearActiveConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      messages: {},
      loading: false,

      loadConversations: async () => {
        try {
          set({ loading: true });
          const conversations = await chatService.getConversations();
          set({ conversations });
        } catch (error) {
          console.error('Failed to load conversations:', error);
        } finally {
          set({ loading: false });
        }
      },

      selectConversation: async (id: string) => {
        set({ activeConversationId: id, loading: true });

        // Load messages if not already loaded
        if (!get().messages[id]) {
          try {
            const messages = await chatService.getMessages(id);
            set({
              messages: {
                ...get().messages,
                [id]: messages,
              },
              loading: false,
            });
          } catch (error) {
            console.error('Failed to load messages:', error);
            set({ loading: false });
          }
        } else {
          set({ loading: false });
        }
      },

      sendMessage: async (message: string) => {
        const { activeConversationId, messages } = get();

        try {
          set({ loading: true });

          // Add user message optimistically
          const userMessage: ChatMessage = {
            id: `temp-${Date.now()}`,
            conversation_id: activeConversationId || 'new',
            role: 'user',
            content: message,
            created_at: new Date().toISOString(),
          };

          if (activeConversationId) {
            set({
              messages: {
                ...messages,
                [activeConversationId]: [
                  ...(messages[activeConversationId] || []),
                  userMessage,
                ],
              },
            });
          }

          console.log('Sending message to API:', { message, activeConversationId });

          // Send message to API
          const response = await chatService.sendMessage(message, activeConversationId || undefined);

          console.log('Received response:', response);

          // Validate response
          if (!response || !response.conversation_id) {
            console.error('Invalid response from API:', response);
            throw new Error('Invalid response from server');
          }

          // Update with real conversation ID if it was a new conversation
          if (!activeConversationId && response.conversation_id) {
            set({ activeConversationId: response.conversation_id });

            // Reload conversations to get the new one
            await get().loadConversations();
          }

          // Add assistant response
          const conversationId = response.conversation_id;
          const existingMessages = get().messages[conversationId] || [];

          // Build new messages array with proper validation
          const newMessages = [
            ...existingMessages.filter(
              (msg) => msg && msg.id && msg.id !== userMessage.id
            ),
            { ...userMessage, id: `user-${Date.now()}`, conversation_id: conversationId },
          ];

          // Only add assistant message if it exists and is valid
          if (response.message && response.message.id && response.message.content) {
            console.log('Adding assistant message:', response.message);
            newMessages.push(response.message);
          } else {
            console.warn('No valid assistant message in response:', response.message);
          }

          console.log('Setting messages:', { conversationId, messageCount: newMessages.length });

          set({
            messages: {
              ...get().messages,
              [conversationId]: newMessages,
            },
          });
        } catch (error) {
          console.error('Failed to send message:', error);
          // Remove optimistic message on error
          if (get().activeConversationId) {
            const conversationId = get().activeConversationId!;
            set({
              messages: {
                ...get().messages,
                [conversationId]: (get().messages[conversationId] || []).filter(
                  (msg) => msg && msg.id && !msg.id.startsWith('temp-')
                ),
              },
            });
          }
          throw error;
        } finally {
          set({ loading: false });
        }
      },

      addMessage: (conversationId: string, message: ChatMessage) => {
        const { messages } = get();
        set({
          messages: {
            ...messages,
            [conversationId]: [...(messages[conversationId] || []), message],
          },
        });
      },

      clearActiveConversation: () => {
        set({ activeConversationId: null });
      },

      deleteConversation: async (id: string) => {
        try {
          await chatService.deleteConversation(id);

          // Remove from local state
          const { conversations, messages, activeConversationId } = get();
          const newMessages = { ...messages };
          delete newMessages[id];

          set({
            conversations: conversations.filter((c) => c.id !== id),
            messages: newMessages,
            activeConversationId: activeConversationId === id ? null : activeConversationId,
          });
        } catch (error) {
          console.error('Failed to delete conversation:', error);
          throw error;
        }
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        conversations: state.conversations,
        messages: state.messages,
      }),
    }
  )
);
