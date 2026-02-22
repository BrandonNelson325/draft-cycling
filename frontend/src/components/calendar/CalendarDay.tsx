interface CalendarDayProps {
  date: Date;
  isCurrentMonth: boolean;
  hasActivities: boolean;
  activityCount?: number;
  onClick?: () => void;
}

export function CalendarDay({
  date,
  isCurrentMonth,
  hasActivities,
  activityCount = 0,
  onClick,
}: CalendarDayProps) {
  const isToday =
    date.toDateString() === new Date().toDateString();

  return (
    <button
      onClick={onClick}
      className={`
        aspect-square p-2 border border-border rounded-md
        ${isCurrentMonth ? 'bg-card' : 'bg-muted/50'}
        ${isToday ? 'ring-2 ring-primary' : ''}
        ${hasActivities ? 'font-semibold' : ''}
        hover:bg-accent transition-colors
      `}
    >
      <div className="flex flex-col h-full">
        <div className={`text-sm ${!isCurrentMonth ? 'text-muted-foreground' : ''}`}>
          {date.getDate()}
        </div>
        {hasActivities && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex gap-1">
              {Array.from({ length: Math.min(activityCount, 3) }).map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-primary"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}
