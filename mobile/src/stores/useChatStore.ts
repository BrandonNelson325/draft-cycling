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
  refreshActiveMessages: () => Promise<void>;
  pollForBackgroundUpdates: (conversationId: string) => void;
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

              // If the coach said the plan is building in the background, the
              // real result message lands in the DB shortly. Poll so it shows
              // up even if the user stays on this screen.
              if (/background|building|on your calendar|notif/i.test(accumulatedContent)) {
                get().pollForBackgroundUpdates(conversationId);
              }
            } else {
              set({ streamingContent: '', toolStatus: null, loading: false });
            }

            // Reload conversations to get updated titles
            get().loadConversations();
          },

          onError: async (error: string) => {
            console.error('Stream error:', error);
            // DO NOT wipe the turn. The backend persists the user message
            // immediately and (on its own graceful-recovery path) an assistant
            // message too, so the source of truth is the DB. Refetch it so the
            // user keeps their message + whatever was saved — including a
            // background plan-build message that may land shortly. Wiping here
            // is what made plan builds look like they "dropped the whole
            // conversation" and never tried.
            const convId = conversationId || initialConversationId;
            if (convId) {
              try {
                const serverMessages = await chatService.getMessages(convId);
                if (serverMessages.length > 0) {
                  set({ messages: { ...get().messages, [convId]: serverMessages } });
                }
              } catch (refetchErr) {
                console.error('Failed to refetch messages after stream error:', refetchErr);
              }
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

  /**
   * Cache-bypassing refetch of the active conversation's messages. Used on
   * screen focus and by the background-build poll so messages written by a
   * background plan job (or a server-side graceful-recovery message) surface
   * even though selectConversation caches by default.
   */
  refreshActiveMessages: async () => {
    const convId = get().activeConversationId;
    if (!convId) return;
    try {
      const serverMessages = await chatService.getMessages(convId);
      if (serverMessages.length > 0) {
        set({ messages: { ...get().messages, [convId]: serverMessages } });
      }
    } catch (err) {
      console.error('Failed to refresh active messages:', err);
    }
  },

  /**
   * Plan builds run as a background job that writes its result message to the
   * DB when finished (30s-2min later). If the user stays on the chat screen,
   * nothing would update without this. Poll a handful of times, merging in any
   * new server messages, then stop. Idempotent-ish: callers gate on a
   * background-build hint so we don't poll on every message.
   */
  pollForBackgroundUpdates: (conversationId: string) => {
    let attempts = 0;
    const maxAttempts = 12; // 12 × 12s = ~2.5 min coverage
    const tick = async () => {
      attempts++;
      try {
        const serverMessages = await chatService.getMessages(conversationId);
        const localCount = (get().messages[conversationId] || []).length;
        if (serverMessages.length > localCount) {
          set({ messages: { ...get().messages, [conversationId]: serverMessages } });
          return; // new message landed (the plan result) — stop polling
        }
      } catch {
        // ignore transient errors, keep polling
      }
      if (attempts < maxAttempts) {
        setTimeout(tick, 12000);
      }
    };
    setTimeout(tick, 12000);
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
