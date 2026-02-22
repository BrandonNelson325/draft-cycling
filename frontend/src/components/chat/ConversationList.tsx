import { useState } from 'react';
import { Button } from '../ui/button';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { ChatConversation } from '../../services/chatService';

interface ConversationListProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}: ConversationListProps) {
  const [conversationToDelete, setConversationToDelete] = useState<ChatConversation | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, conversation: ChatConversation) => {
    e.stopPropagation();
    setConversationToDelete(conversation);
  };

  const handleConfirmDelete = () => {
    if (conversationToDelete) {
      onDeleteConversation(conversationToDelete.id);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'No date';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid date';

      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days < 7) return `${days} days ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) {
      return 'Invalid date';
    }
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-gray-200">
          <Button onClick={onNewConversation} className="w-full rounded-xl font-semibold shadow-sm hover:shadow-md transition-all">
            + New Conversation
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No conversations yet. Start your first chat!
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`relative group transition-colors ${
                    activeConversationId === conversation.id
                      ? 'bg-primary/5 border-l-4 border-primary'
                      : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
                  <button
                    onClick={() => onSelectConversation(conversation.id)}
                    className="w-full text-left p-4 pr-12"
                  >
                    <div className="font-medium text-sm mb-1 truncate text-foreground">
                      {conversation.title || 'New Conversation'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate((conversation as any).last_message_at || conversation.updated_at || conversation.created_at)}
                    </div>
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(e, conversation)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={conversationToDelete !== null}
        onClose={() => setConversationToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Conversation?"
        message={`Are you sure you want to delete "${conversationToDelete?.title || 'this conversation'}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </>
  );
}
