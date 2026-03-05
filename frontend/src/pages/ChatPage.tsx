import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { Loader2, MessageCircle } from 'lucide-react';
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

  const startingConversation = useRef(false);

  const {
    conversations,
    activeConversationId,
    messages,
    loading,
    toolStatus,
    loadConversations,
    startConversation,
    selectConversation,
    sendMessage,
    clearActiveConversation,
    deleteConversation,
  } = useChatStore();

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Select conversation from URL param
  useEffect(() => {
    if (conversationId) {
      selectConversation(conversationId);
    }
  }, [conversationId, selectConversation]);

  // Auto-start conversation with AI greeting when no active conversation
  // Skip if there's an initialMessage — user will send that manually
  useEffect(() => {
    if (!conversationId && !activeConversationId && !initialMessage && !startingConversation.current) {
      startingConversation.current = true;
      startConversation().finally(() => {
        startingConversation.current = false;
      });
    }
  }, [conversationId, activeConversationId, startConversation]);

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

  // Loading state shown while greeting generates
  const emptyState = (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
      <p className="text-sm">Starting conversation...</p>
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
              <ChatThread messages={activeMessages} loading={loading} toolStatus={toolStatus} />
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
