import { useEffect, useState, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { useChatStore } from '../stores/useChatStore';
import { chatService } from '../services/chatService';
import { ChatThread } from '../components/chat/ChatThread';
import { ChatInput } from '../components/chat/ChatInput';
import { ConversationList } from '../components/chat/ConversationList';
import { Button } from '../components/ui/button';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

function ChatPageContent() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const location = useLocation();
  const [showConversations, setShowConversations] = useState(false);
  const initialMessageSent = useRef(false);

  const {
    conversations,
    activeConversationId,
    messages,
    loading,
    loadConversations,
    selectConversation,
    sendMessage,
    clearActiveConversation,
    deleteConversation,
  } = useChatStore();

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (conversationId) {
      selectConversation(conversationId);
    }
  }, [conversationId, selectConversation]);

  // Handle pre-populated message from daily analysis
  useEffect(() => {
    const state = location.state as { initialMessage?: string } | null;
    if (state?.initialMessage && !initialMessageSent.current) {
      initialMessageSent.current = true;
      // Send the message after a brief delay to ensure chat is ready
      setTimeout(() => {
        handleSendMessage(state.initialMessage!);
      }, 500);
    }
  }, [location.state]);

  // Auto-start new conversation if user hasn't chatted today
  useEffect(() => {
    const checkAndStartDailyChat = async () => {
      // Skip if already loading or have active conversation
      if (loading || conversationId || activeConversationId) return;

      // Check if user has chatted today
      const hasChattedToday = checkIfChattedToday();

      if (!hasChattedToday) {
        // Start new conversation with daily briefing
        await handleStartNewConversation();
      }
    };

    checkAndStartDailyChat();
  }, [conversationId, activeConversationId, loading]);

  const checkIfChattedToday = (): boolean => {
    const lastChatDate = localStorage.getItem('last_chat_date');
    if (!lastChatDate) return false;

    const lastChat = new Date(lastChatDate);
    const today = new Date();

    return (
      lastChat.getFullYear() === today.getFullYear() &&
      lastChat.getMonth() === today.getMonth() &&
      lastChat.getDate() === today.getDate()
    );
  };

  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];

  const handleStartNewConversation = async () => {
    try {
      // This will create a conversation with a greeting message
      const result = await chatService.startConversation();

      // Select the new conversation
      selectConversation(result.conversation_id);

      // Reload conversations list
      await loadConversations();
    } catch (error: any) {
      console.error('Failed to start conversation:', error);
      toast.error(error.message || 'Failed to start conversation. Please try again.');
    }
  };

  const handleSendMessage = async (message: string) => {
    try {
      // Mark that user has chatted today
      localStorage.setItem('last_chat_date', new Date().toISOString());

      await sendMessage(message);
    } catch (error: any) {
      console.error('Failed to send message:', error);
      // Show error toast to user
      toast.error(error.message || 'Failed to send message. Please try again.', {
        duration: 5000,
        position: 'top-center',
      });
    }
  };

  const handleNewConversation = async () => {
    clearActiveConversation();
    setShowConversations(false);

    // Start a new conversation with greeting
    await handleStartNewConversation();
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      toast.success('Conversation deleted');
    } catch (error: any) {
      console.error('Failed to delete conversation:', error);
      toast.error(error.message || 'Failed to delete conversation');
    }
  };

  return (
    <>
      <Toaster />
      {/* Mobile Layout */}
      <div className="md:hidden h-[calc(100vh-4rem)] flex flex-col">
        {/* Mobile header */}
        <div className="border-b border-border p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">AI Coach Chat</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConversations(!showConversations)}
          >
            {showConversations ? 'Chat' : 'Conversations'}
          </Button>
        </div>

        {/* Mobile content */}
        {showConversations ? (
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={(id) => {
              selectConversation(id);
              setShowConversations(false);
            }}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        ) : (
          <>
            <ChatThread messages={activeMessages} loading={loading} />
            <div className="border-t border-border p-4">
              <ChatInput onSend={handleSendMessage} disabled={loading} />
            </div>
          </>
        )}
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex h-[calc(100vh-4rem)]">
        {/* Conversations sidebar */}
        <div className="w-80 border-r border-gray-200 flex-shrink-0 bg-white">
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={selectConversation}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-gray-50">
          <div className="border-b border-gray-200 p-4 flex items-center gap-3 bg-white">
            <img src="/logo.png" alt="Draft" className="h-8" />
            <span className="text-sm font-medium text-muted-foreground">AI Coach</span>
          </div>
          <ChatThread messages={activeMessages} loading={loading} />
          <div className="border-t border-gray-200 p-6 bg-white">
            <div className="max-w-4xl mx-auto">
              <ChatInput onSend={handleSendMessage} disabled={loading} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function ChatPage() {
  return (
    <ErrorBoundary>
      <ChatPageContent />
    </ErrorBoundary>
  );
}
