import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  content: React.ReactNode;
}

/**
 * Small ⓘ icon that shows a tooltip on hover (desktop) or tap (mobile).
 * Automatically opens downward when near the top of the viewport.
 */
export function InfoTooltip({ content }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [openDown, setOpenDown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Decide open direction based on available space above the icon
  useEffect(() => {
    if (!visible || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // If less than 260px above the icon, open downward instead
    setOpenDown(rect.top < 260);
  }, [visible]);

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
          className={`absolute z-50 left-1/2 -translate-x-1/2 w-72 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-3 text-xs text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 ${
            openDown ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
          style={{ maxWidth: 'min(288px, calc(100vw - 2rem))' }}
        >
          {/* Arrow */}
          {openDown ? (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-white dark:bg-gray-900 border-l border-t border-gray-200 dark:border-gray-700 rotate-45 mb-[-1px]" />
          ) : (
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-white dark:bg-gray-900 border-r border-b border-gray-200 dark:border-gray-700 rotate-45 -mt-1" />
          )}
          {content}
        </div>
      )}
    </div>
  );
}
