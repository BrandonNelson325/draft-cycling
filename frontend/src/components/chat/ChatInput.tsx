import { useState } from 'react';
import { Button } from '../ui/button';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  initialValue?: string;
}

export function ChatInput({ onSend, disabled, initialValue }: ChatInputProps) {
  const [message, setMessage] = useState(initialValue ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSend(message);
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask your AI cycling coach..."
        disabled={disabled}
        rows={2}
        className="flex-1 min-w-0 resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all"
      />
      <Button
        type="submit"
        disabled={disabled || !message.trim()}
        className="shrink-0 self-end rounded-xl px-4 md:px-6 h-auto py-3 font-semibold shadow-sm hover:shadow-md transition-all"
      >
        Send
      </Button>
    </form>
  );
}
