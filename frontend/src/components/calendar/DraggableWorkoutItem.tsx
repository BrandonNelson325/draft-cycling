import { useDrag } from 'react-dnd';
import { Clock, Zap } from 'lucide-react';
import type { Workout } from '../../services/workoutService';
import { cn } from '../../lib/utils';

export const ItemTypes = {
  WORKOUT: 'workout',
  CALENDAR_ENTRY: 'calendar_entry',
};

interface DraggableWorkoutItemProps {
  workout: Workout;
  calendarEntryId?: string;
  scheduled?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

const workoutTypeColors: Record<string, string> = {
  endurance: 'border-blue-500 bg-blue-50 dark:bg-blue-800/70 dark:text-blue-50',
  tempo: 'border-primary bg-green-50 dark:bg-green-800/70 dark:text-green-50',
  threshold: 'border-orange-500 bg-orange-50 dark:bg-orange-800/70 dark:text-orange-50',
  vo2max: 'border-red-500 bg-red-50 dark:bg-red-800/70 dark:text-red-50',
  sprint: 'border-purple-500 bg-purple-50 dark:bg-purple-800/70 dark:text-purple-50',
  recovery: 'border-gray-500 bg-gray-50 dark:bg-gray-700/70 dark:text-gray-50',
  custom: 'border-primary bg-green-50 dark:bg-green-800/70 dark:text-green-50',
};

export function DraggableWorkoutItem({
  workout,
  calendarEntryId,
  scheduled = false,
  compact = false,
  onClick,
}: DraggableWorkoutItemProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: calendarEntryId ? ItemTypes.CALENDAR_ENTRY : ItemTypes.WORKOUT,
    item: {
      workout,
      calendarEntryId,
      scheduled,
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  if (compact) {
    return (
      <div
        ref={drag as any}
        onClick={onClick}
        className={cn(
          'text-xs p-1.5 rounded border-l-2 cursor-move',
          workoutTypeColors[workout.workout_type],
          isDragging && 'opacity-50',
          'hover:shadow-md transition-shadow'
        )}
        style={{ opacity: isDragging ? 0.5 : 1 }}
      >
        <div className="font-medium truncate">{workout.name}</div>
        <div className="flex items-center gap-2 text-muted-foreground dark:text-current dark:opacity-70">
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {workout.duration_minutes}m
          </span>
          {workout.tss && (
            <span className="flex items-center gap-0.5">
              <Zap className="w-3 h-3" />
              {workout.tss}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={drag as any}
      onClick={onClick}
      className={cn(
        'p-3 rounded-lg border-l-4 cursor-move',
        workoutTypeColors[workout.workout_type],
        isDragging && 'opacity-50',
        'hover:shadow-lg transition-all'
      )}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <div className="font-semibold mb-1">{workout.name}</div>
      {workout.description && (
        <div className="text-sm text-muted-foreground dark:text-current dark:opacity-70 mb-2 line-clamp-2">
          {workout.description}
        </div>
      )}
      <div className="flex items-center gap-3 text-sm text-muted-foreground dark:text-current dark:opacity-70">
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {workout.duration_minutes} min
        </span>
        {workout.tss && (
          <span className="flex items-center gap-1">
            <Zap className="w-4 h-4" />
            {workout.tss} TSS
          </span>
        )}
        <span className="capitalize text-xs">{workout.workout_type}</span>
      </div>
    </div>
  );
}
