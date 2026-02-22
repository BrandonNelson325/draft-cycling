import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '../../services/chatService';

interface MessageBubbleProps {
  message: ChatMessage;
}

// Clean up AI responses by removing verbose tool call details
function cleanAIResponse(content: string): string {
  // Remove XML-style tool calls like <schedule_workout>...</schedule_workout>
  let cleaned = content.replace(/<schedule_workout>[\s\S]*?<\/schedule_workout>/g, '');
  cleaned = cleaned.replace(/<create_workout>[\s\S]*?<\/create_workout>/g, '');
  cleaned = cleaned.replace(/<move_workout>[\s\S]*?<\/move_workout>/g, '');
  cleaned = cleaned.replace(/<delete_workout_from_calendar>[\s\S]*?<\/delete_workout_from_calendar>/g, '');
  cleaned = cleaned.replace(/<get_calendar>[\s\S]*?<\/get_calendar>/g, '');
  cleaned = cleaned.replace(/<update_athlete_ftp>[\s\S]*?<\/update_athlete_ftp>/g, '');

  // Remove standalone JSON blocks that look like tool calls
  cleaned = cleaned.replace(/\{[\s\S]*?"athlete_id"[\s\S]*?\}/g, '');

  // Clean up excessive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Remove lines that start with common tool call patterns
  cleaned = cleaned.split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return !(
        trimmed.startsWith('Scheduling Week') ||
        trimmed.startsWith('Creating workout:') ||
        trimmed === '{' ||
        trimmed === '}' ||
        trimmed.startsWith('"athlete_id"')
      );
    })
    .join('\n');

  return cleaned.trim();
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (!message || !message.content) {
    return null;
  }

  const isUser = message.role === 'user';
  const displayContent = !isUser ? cleanAIResponse(message.content) : message.content;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div
        className={`max-w-[75%] ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-3xl rounded-br-md'
            : 'bg-gray-100 text-foreground rounded-3xl rounded-bl-md'
        } px-5 py-3.5 shadow-sm`}
      >
        <div className="text-sm leading-relaxed">
          {isUser ? (
            <p className="whitespace-pre-wrap">{displayContent}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-foreground prose-strong:text-foreground prose-strong:font-semibold">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="mb-1">{children}</li>,
                  code: ({ children }) => (
                    <code className="bg-white/80 px-1.5 py-0.5 rounded text-xs font-mono border border-gray-200">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-white/80 p-3 rounded-lg overflow-x-auto mb-2 border border-gray-200">
                      {children}
                    </pre>
                  ),
                  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                }}
              >
                {displayContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <div className={`text-xs mt-2 ${isUser ? 'opacity-80' : 'opacity-60'}`}>
          {new Date(message.created_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}
