import { create } from 'zustand';
import { chatService, type ChatMessage, type ChatConversation } from '../services/chatService';

interface ChatStore {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  loading: boolean;
  streamingContent: string;
  toolStatus: string | null;

  loadConversations: () => Promise<void>;
  startConversation: () => Promise<void>;
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
  streamingContent: '',
  toolStatus: null,

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

  startConversation: async () => {
    set({ loading: true });
    try {
      const response = await chatService.startConversation();
      const { conversation_id, message } = response;
      set({
        activeConversationId: conversation_id,
        messages: {
          ...get().messages,
          [conversation_id]: [message],
        },
      });
      await get().loadConversations();
    } catch (error) {
      console.error('Failed to start conversation:', error);
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

    set({ loading: true, streamingContent: '', toolStatus: null });

    let conversationId = initialConversationId;
    let accumulatedContent = '';

    try {
      await chatService.sendMessageStream(
        message,
        initialConversationId,
        {
          onStart: (convId: string) => {
            conversationId = convId;

            if (!initialConversationId) {
              // New conversation
              set({
                activeConversationId: convId,
                messages: {
                  ...get().messages,
                  [convId]: [{ ...userMessage, conversation_id: convId }],
                },
              });
            }
          },

          onToken: (text: string) => {
            accumulatedContent += text;
            set({ streamingContent: accumulatedContent, toolStatus: null });
          },

          onProgress: (progressMessage: string) => {
            set({ toolStatus: progressMessage });
          },

          onDone: () => {
            if (conversationId && accumulatedContent) {
              const assistantMessage: ChatMessage = {
                id: `assistant-${Date.now()}`,
                conversation_id: conversationId,
                role: 'assistant',
                content: accumulatedContent,
                created_at: new Date().toISOString(),
              };

              const convMessages = get().messages[conversationId] || [];
              set({
                messages: {
                  ...get().messages,
                  [conversationId]: [
                    ...convMessages.filter((m) => m.id !== userTempId),
                    { ...userMessage, id: `user-${Date.now()}`, conversation_id: conversationId },
                    assistantMessage,
                  ],
                },
                streamingContent: '',
                toolStatus: null,
                loading: false,
              });
            } else {
              set({ streamingContent: '', toolStatus: null, loading: false });
            }

            // Reload conversations to get updated titles
            get().loadConversations();
          },

          onError: (error: string) => {
            console.error('Stream error:', error);
            // Remove optimistic user message on error
            if (conversationId) {
              set({
                messages: {
                  ...get().messages,
                  [conversationId]: (get().messages[conversationId] || []).filter(
                    (m) => m.id !== userTempId
                  ),
                },
              });
            }
            set({ streamingContent: '', toolStatus: null, loading: false });
          },
        }
      );
    } catch (streamError) {
      console.warn('Streaming failed, falling back to non-streaming:', streamError);

      // Fallback to non-streaming endpoint
      try {
        set({ toolStatus: 'Processing your message...', streamingContent: '' });
        const response = await chatService.sendMessage(message, initialConversationId || undefined);
        const convId = response.conversation_id;

        if (!initialConversationId) {
          set({
            activeConversationId: convId,
            messages: {
              ...get().messages,
              [convId]: [
                { ...userMessage, conversation_id: convId },
                response.message,
              ],
            },
          });
          await get().loadConversations();
        } else {
          const convMessages = get().messages[convId] || [];
          set({
            messages: {
              ...get().messages,
              [convId]: [
                ...convMessages.filter((m) => m.id !== userTempId),
                { ...userMessage, id: `user-${Date.now()}`, conversation_id: convId },
                response.message,
              ],
            },
          });
        }
        set({ streamingContent: '', toolStatus: null, loading: false });
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        const convId = conversationId || initialConversationId;
        if (convId) {
          set({
            messages: {
              ...get().messages,
              [convId]: (get().messages[convId] || []).filter(
                (m) => m.id !== userTempId
              ),
            },
          });
        }
        set({ streamingContent: '', toolStatus: null, loading: false });
        throw fallbackError;
      }
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
