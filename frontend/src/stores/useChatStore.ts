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
        const initialConversationId = get().activeConversationId;

        const userTempId = `temp-user-${Date.now()}`;
        const streamingId = `streaming-${Date.now()}`;

        // Add optimistic user message + empty streaming placeholder
        const userMessage: ChatMessage = {
          id: userTempId,
          conversation_id: initialConversationId || 'new',
          role: 'user',
          content: message,
          created_at: new Date().toISOString(),
        };
        const streamingMessage: ChatMessage = {
          id: streamingId,
          conversation_id: initialConversationId || 'new',
          role: 'assistant',
          content: '',
          created_at: new Date().toISOString(),
        };

        const addOptimistic = (convId: string) => {
          const existing = get().messages[convId] || [];
          set({
            messages: {
              ...get().messages,
              [convId]: [
                ...existing.filter((m) => !m.id.startsWith('temp-') && m.id !== streamingId),
                { ...userMessage, conversation_id: convId },
                { ...streamingMessage, conversation_id: convId },
              ],
            },
          });
        };

        if (initialConversationId) {
          addOptimistic(initialConversationId);
        }

        set({ loading: true });

        let resolvedConvId = initialConversationId;

        try {

          await chatService.sendMessageStream(message, initialConversationId, {
            onStart: (conversationId) => {
              resolvedConvId = conversationId;
              if (!initialConversationId) {
                set({ activeConversationId: conversationId });
                addOptimistic(conversationId);
              }
            },
            onToken: (text) => {
              const convId = resolvedConvId || get().activeConversationId;
              if (!convId) return;
              const convMessages = get().messages[convId] || [];
              const idx = convMessages.findIndex((m) => m.id === streamingId);
              if (idx !== -1) {
                const updated = [...convMessages];
                updated[idx] = { ...updated[idx], content: updated[idx].content + text };
                set({ messages: { ...get().messages, [convId]: updated } });
              }
            },
            onDone: async () => {
              const convId = resolvedConvId || get().activeConversationId;
              if (convId) {
                // Fetch real messages from DB to replace the streaming placeholder
                try {
                  const realMessages = await chatService.getMessages(convId);
                  set({ messages: { ...get().messages, [convId]: realMessages } });
                } catch (e) {
                  // If fetch fails, the streamed content is already in the store — leave it
                }
              }
              // Reload conversation list for new conversations
              if (!initialConversationId) {
                await get().loadConversations();
              }
            },
            onError: (error) => {
              console.error('Stream error:', error);
              // Remove optimistic messages
              const convId = resolvedConvId || initialConversationId;
              if (convId) {
                set({
                  messages: {
                    ...get().messages,
                    [convId]: (get().messages[convId] || []).filter(
                      (m) => m.id !== userTempId && m.id !== streamingId
                    ),
                  },
                });
              }
            },
          });
        } catch (error) {
          console.error('Failed to send message:', error);
          const convId = resolvedConvId || initialConversationId;
          if (convId) {
            set({
              messages: {
                ...get().messages,
                [convId]: (get().messages[convId] || []).filter(
                  (m) => m.id !== userTempId && m.id !== streamingId
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
