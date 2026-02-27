import { create } from 'zustand';
import { chatService, type ChatMessage, type ChatConversation } from '../services/chatService';

interface ChatStore {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  loading: boolean;

  loadConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  clearActiveConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
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

    if (!get().messages[id]) {
      try {
        const messages = await chatService.getMessages(id);
        set({
          messages: { ...get().messages, [id]: messages },
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
    const assistantTempId = `temp-assistant-${Date.now()}`;

    const userMessage: ChatMessage = {
      id: userTempId,
      conversation_id: initialConversationId || 'new',
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };

    // Optimistically add user message
    if (initialConversationId) {
      const existing = get().messages[initialConversationId] || [];
      set({
        messages: {
          ...get().messages,
          [initialConversationId]: [...existing, userMessage],
        },
      });
    }

    set({ loading: true });

    try {
      const response = await chatService.sendMessage(message, initialConversationId || undefined);
      const conversationId = response.conversation_id;

      if (!initialConversationId) {
        // New conversation — set active and add both messages
        const msgs: ChatMessage[] = [
          { ...userMessage, conversation_id: conversationId },
          response.message,
        ];
        set({
          activeConversationId: conversationId,
          messages: { ...get().messages, [conversationId]: msgs },
        });
        // Reload conversation list
        await get().loadConversations();
      } else {
        // Existing conversation — replace optimistic user message + add assistant message
        const convMessages = get().messages[conversationId] || [];
        set({
          messages: {
            ...get().messages,
            [conversationId]: [
              ...convMessages.filter((m) => m.id !== userTempId),
              { ...userMessage, id: `user-${Date.now()}` },
              response.message,
            ],
          },
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove optimistic user message on error
      if (initialConversationId) {
        set({
          messages: {
            ...get().messages,
            [initialConversationId]: (get().messages[initialConversationId] || []).filter(
              (m) => m.id !== userTempId && m.id !== assistantTempId
            ),
          },
        });
      }
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  clearActiveConversation: () => {
    set({ activeConversationId: null });
  },

  deleteConversation: async (id: string) => {
    await chatService.deleteConversation(id);

    const { conversations, messages, activeConversationId } = get();
    const newMessages = { ...messages };
    delete newMessages[id];

    set({
      conversations: conversations.filter((c) => c.id !== id),
      messages: newMessages,
      activeConversationId: activeConversationId === id ? null : activeConversationId,
    });
  },
}));
