import { Clock, Zap, Calendar, Download, Eye, Trash2 } from 'lucide-react';
import type { Workout, WorkoutType } from '../../services/workoutService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface WorkoutCardProps {
  workout: Workout;
  onView?: (workout: Workout) => void;
  onSchedule?: (workout: Workout) => void;
  onDelete?: (workout: Workout) => void;
  onDownloadZWO?: (workout: Workout) => void;
  onDownloadFIT?: (workout: Workout) => void;
}

const workoutTypeColors: Record<WorkoutType, string> = {
  endurance: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  tempo: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  threshold: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  vo2max: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  sprint: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  recovery: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  custom: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
};

export function WorkoutCard({
  workout,
  onView,
  onSchedule,
  onDelete,
  onDownloadZWO,
  onDownloadFIT,
}: WorkoutCardProps) {
  const intervalCount = workout.intervals?.length || 0;

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{workout.name}</CardTitle>
            {workout.description && (
              <CardDescription className="line-clamp-2 mt-1">
                {workout.description}
              </CardDescription>
            )}
          </div>
          {workout.generated_by_ai && (
            <span className="ml-2 px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              AI
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'px-2 py-1 text-xs font-medium rounded-full capitalize',
              workoutTypeColors[workout.workout_type]
            )}
          >
            {workout.workout_type}
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
          <span>{intervalCount} intervals</span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {onView && (
            <Button variant="outline" size="sm" onClick={() => onView(workout)}>
              <Eye className="w-4 h-4 mr-1" />
              View
            </Button>
          )}

          {onSchedule && (
            <Button variant="outline" size="sm" onClick={() => onSchedule(workout)}>
              <Calendar className="w-4 h-4 mr-1" />
              Schedule
            </Button>
          )}

          {onDownloadZWO && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownloadZWO(workout)}
              title="Download ZWO (Zwift)"
            >
              <Download className="w-4 h-4 mr-1" />
              ZWO
            </Button>
          )}

          {onDownloadFIT && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDownloadFIT(workout)}
              title="Download FIT (Garmin)"
            >
              <Download className="w-4 h-4 mr-1" />
              FIT
            </Button>
          )}

          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(workout)}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
