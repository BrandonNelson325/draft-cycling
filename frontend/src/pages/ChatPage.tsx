import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { MessageCircle } from 'lucide-react';
import { useChatStore } from '../stores/useChatStore';
import { ChatThread } from '../components/chat/ChatThread';
import { ChatInput } from '../components/chat/ChatInput';
import { ConversationList } from '../components/chat/ConversationList';
import { Button } from '../components/ui/button';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

function ChatPageContent() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const location = useLocation();
  const [showConversations, setShowConversations] = useState(false);

  // Pre-filled message from morning modal (shown in input, not auto-sent)
  const initialMessage = (location.state as { initialMessage?: string } | null)?.initialMessage ?? '';

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

  // Load conversations and auto-select most recent on first visit
  useEffect(() => {
    const init = async () => {
      await loadConversations();
    };
    init();
  }, [loadConversations]);

  // Select conversation from URL param
  useEffect(() => {
    if (conversationId) {
      selectConversation(conversationId);
    }
  }, [conversationId, selectConversation]);

  // Auto-select most recent conversation if none is active and no URL param
  useEffect(() => {
    if (!conversationId && !activeConversationId && conversations.length > 0) {
      selectConversation(conversations[0].id);
    }
  }, [conversations, conversationId, activeConversationId, selectConversation]);

  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];

  const handleSendMessage = async (message: string) => {
    try {
      await sendMessage(message);
    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast.error(error.message || 'Failed to send message. Please try again.', {
        duration: 5000,
        position: 'top-center',
      });
    }
  };

  const handleNewConversation = () => {
    clearActiveConversation();
    setShowConversations(false);
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      toast.success('Conversation deleted');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete conversation');
    }
  };

  // Empty state shown when no conversation is selected
  const emptyState = (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <MessageCircle className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">Ask your AI coach</h3>
      <p className="text-sm max-w-xs">
        Ask about your training, get workout suggestions, or build a training plan.
      </p>
    </div>
  );

  return (
    <>
      <Toaster />

      {/* Mobile Layout */}
      <div className="md:hidden h-[calc(100vh-4rem)] flex flex-col">
        <div className="border-b border-border p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">AI Coach</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConversations(!showConversations)}
          >
            {showConversations ? 'Chat' : 'Conversations'}
          </Button>
        </div>

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
            {activeConversationId ? (
              <ChatThread messages={activeMessages} loading={loading} />
            ) : (
              emptyState
            )}
            <div className="border-t border-border p-4">
              <ChatInput
                onSend={handleSendMessage}
                disabled={loading}
                initialValue={initialMessage}
              />
            </div>
          </>
        )}
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex h-[calc(100vh-4rem)]">
        <div className="w-80 border-r border-gray-200 flex-shrink-0 bg-white">
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={selectConversation}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>

        <div className="flex-1 flex flex-col bg-gray-50">
          <div className="border-b border-gray-200 p-4 flex items-center gap-3 bg-white">
            <img src="/logo.png" alt="Draft" className="h-8" />
            <span className="text-sm font-medium text-muted-foreground">AI Coach</span>
          </div>

          {activeConversationId ? (
            <ChatThread messages={activeMessages} loading={loading} />
          ) : (
            emptyState
          )}

          <div className="border-t border-gray-200 p-6 bg-white">
            <div className="max-w-4xl mx-auto">
              <ChatInput
                onSend={handleSendMessage}
                disabled={loading}
                initialValue={initialMessage}
              />
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
