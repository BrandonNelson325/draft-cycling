import { useDrop } from 'react-dnd';
import { cn } from '../../lib/utils';
import { ItemTypes } from './DraggableWorkoutItem';
import type { CalendarEntry, StravaActivity } from '../../services/calendarService';
import { DraggableWorkoutItem } from './DraggableWorkoutItem';
import { Activity } from 'lucide-react';

interface DroppableCalendarDayProps {
  date: Date;
  isCurrentMonth: boolean;
  entries: CalendarEntry[];
  stravaActivities?: StravaActivity[];
  onClick?: () => void;
  onDrop?: (item: any, date: Date) => void;
  onWorkoutClick?: (entry: CalendarEntry) => void;
  phase?: 'base' | 'build' | 'peak' | 'taper';
}

export function DroppableCalendarDay({
  date,
  isCurrentMonth,
  entries,
  stravaActivities = [],
  onClick,
  onDrop,
  onWorkoutClick,
  phase,
}: DroppableCalendarDayProps) {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: [ItemTypes.WORKOUT, ItemTypes.CALENDAR_ENTRY],
    drop: (item: any) => {
      if (onDrop) {
        onDrop(item, date);
      }
    },
    canDrop: (item: any) => {
      // Don't allow dropping on the same day if it's a calendar entry
      if (item.calendarEntryId && item.scheduled) {
        const entryDate = entries.find((e) => e.id === item.calendarEntryId)?.scheduled_date;
        if (entryDate) {
          const isSameDay =
            new Date(entryDate).toDateString() === date.toDateString();
          return !isSameDay;
        }
      }
      return true;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  const isToday = date.toDateString() === new Date().toDateString();
  const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));

  const phaseBorderColors = {
    base: 'border-l-blue-500',
    build: 'border-l-orange-500',
    peak: 'border-l-red-500',
    taper: 'border-l-green-500',
  };

  return (
    <div
      ref={drop as any}
      onClick={onClick}
      className={cn(
        'min-h-[60px] md:min-h-[120px] p-1 md:p-2 border rounded-lg transition-all',
        phase && 'border-l-4',
        phase && phaseBorderColors[phase],
        isCurrentMonth ? 'bg-card' : 'bg-muted/50',
        isToday && 'ring-2 ring-primary',
        isPast && 'opacity-60',
        isOver && canDrop && 'bg-primary/10 border-primary border-2',
        isOver && !canDrop && 'bg-destructive/10 border-destructive',
        !isOver && 'hover:bg-accent',
        'cursor-pointer'
      )}
    >
      <div className="flex flex-col h-full">
        {/* Date number */}
        <div
          className={cn(
            'text-sm font-medium mb-1',
            !isCurrentMonth && 'text-muted-foreground',
            isToday && 'font-bold text-primary'
          )}
        >
          {date.getDate()}
        </div>

        {/* Workout entries and Strava activities */}
        <div className="flex-1 overflow-hidden">
          {/* Desktop view - show detailed cards */}
          <div className="hidden md:block space-y-1">
            {/* Scheduled workouts */}
            {entries.slice(0, 2).map((entry) => (
              <div key={entry.id} onClick={(e) => e.stopPropagation()}>
                {entry.workouts && (
                  <DraggableWorkoutItem
                    workout={entry.workouts}
                    calendarEntryId={entry.id}
                    scheduled={true}
                    compact={true}
                    onClick={() => onWorkoutClick?.(entry)}
                  />
                )}
              </div>
            ))}

            {/* Strava activities */}
            {stravaActivities.slice(0, 2).map((activity) => (
              <div
                key={activity.id}
                className="text-xs p-1.5 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <Activity className="w-3 h-3 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-orange-900 dark:text-orange-100">
                    {activity.name}
                  </div>
                  <div className="text-[10px] text-orange-700 dark:text-orange-300">
                    {Math.round(activity.moving_time_seconds / 60)}min
                    {activity.average_watts && ` • ${activity.average_watts}W`}
                    {activity.tss && ` • ${Math.round(activity.tss)} TSS`}
                  </div>
                </div>
              </div>
            ))}

            {/* Show count if there are more items */}
            {(entries.length + stravaActivities.length) > 4 && (
              <div className="text-xs text-muted-foreground text-center">
                +{entries.length + stravaActivities.length - 4} more
              </div>
            )}
          </div>

          {/* Mobile view - show compact dots */}
          <div className="md:hidden flex flex-wrap gap-1 mt-1">
            {/* Scheduled workouts as blue dots */}
            {entries.slice(0, 3).map((entry) => (
              <div
                key={entry.id}
                className="w-2 h-2 rounded-full bg-blue-500"
                title={entry.workouts?.name}
              />
            ))}

            {/* Strava activities as orange dots */}
            {stravaActivities.slice(0, 3).map((activity) => (
              <div
                key={activity.id}
                className="w-2 h-2 rounded-full bg-orange-500"
                title={activity.name}
              />
            ))}

            {/* Show count if there are more items */}
            {(entries.length + stravaActivities.length) > 6 && (
              <div className="text-[10px] text-muted-foreground">
                +{entries.length + stravaActivities.length - 6}
              </div>
            )}
          </div>
        </div>

        {/* Drop indicator */}
        {isOver && canDrop && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/5 rounded-lg pointer-events-none">
            <div className="text-sm font-medium text-primary">Drop here</div>
          </div>
        )}
      </div>
    </div>
  );
}
