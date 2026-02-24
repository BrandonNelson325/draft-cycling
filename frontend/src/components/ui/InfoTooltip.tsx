import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  content: React.ReactNode;
}

/**
 * Small ⓘ icon that shows a tooltip on hover (desktop) or tap (mobile).
 * Automatically flips left when too close to the right edge of the screen.
 */
export function InfoTooltip({ content }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on outside click (mobile tap-away)
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(v => !v)}
    >
      <Info className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help transition-colors" />

      {visible && (
        <div
          ref={tooltipRef}
          className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-72 bg-popover border border-border rounded-lg shadow-lg p-3 text-xs text-popover-foreground"
          style={{ maxWidth: 'min(288px, calc(100vw - 2rem))' }}
        >
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-r border-b border-border rotate-45 -mt-1" />
          {content}
        </div>
      )}
    </div>
  );
}
