import { useEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../../services/chatService';

interface ChatThreadProps {
  messages: ChatMessage[];
  loading?: boolean;
}

export function ChatThread({ messages, loading }: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [loadingMessage, setLoadingMessage] = useState('AI is thinking');
  const [loadingDuration, setLoadingDuration] = useState(0);

  useEffect(() => {
    try {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      console.error('Error scrolling to bottom:', error);
    }
  }, [messages]);

  // Update loading message based on duration
  useEffect(() => {
    if (!loading) {
      setLoadingDuration(0);
      setLoadingMessage('AI is thinking');
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setLoadingDuration(elapsed);

      if (elapsed < 3) {
        setLoadingMessage('AI is thinking');
      } else if (elapsed < 8) {
        setLoadingMessage('Analyzing your training data');
      } else if (elapsed < 15) {
        setLoadingMessage('Creating workouts');
      } else if (elapsed < 25) {
        setLoadingMessage('Scheduling to your calendar');
      } else if (elapsed < 40) {
        setLoadingMessage('Finalizing your training plan');
      } else {
        setLoadingMessage('Almost done');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [loading]);

  // Safety check for messages — keep empty assistant messages (streaming placeholders)
  const safeMessages = (messages || []).filter((msg) => {
    try {
      return msg && msg.id && msg.role && (msg.content || msg.role === 'assistant');
    } catch (error) {
      console.error('Error filtering message:', msg, error);
      return false;
    }
  });

  if (safeMessages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="text-center text-muted-foreground">
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="Draft" className="h-32 opacity-50" />
          </div>
          <p className="text-base font-medium text-gray-600">Start a conversation to get personalized training advice.</p>
          <p className="text-sm text-gray-500 mt-2">Ask about workouts, training plans, or get coaching insights.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {safeMessages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {loading && (
          <div className="flex justify-start mb-6 animate-fadeIn">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 text-foreground rounded-3xl rounded-bl-md px-6 py-4 shadow-md border border-blue-100">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 font-medium">{loadingMessage}</span>
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
                {loadingDuration > 5 && (
                  <div className="text-xs text-gray-500">
                    {loadingDuration}s elapsed {loadingDuration > 20 && '(complex task, please wait)'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
