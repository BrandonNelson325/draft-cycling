import { Clock, Zap, Calendar, Download, Edit, Trash2, X } from 'lucide-react';
import type { Workout } from '../../services/workoutService';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { IntervalVisualizer } from './IntervalVisualizer';
import { cn } from '../../lib/utils';

interface WorkoutDetailProps {
  workout: Workout;
  onClose?: () => void;
  onSchedule?: (workout: Workout) => void;
  onEdit?: (workout: Workout) => void;
  onDelete?: (workout: Workout) => void;
  onDownloadZWO?: (workout: Workout) => void;
  onDownloadFIT?: (workout: Workout) => void;
}

const workoutTypeColors: Record<string, string> = {
  endurance: 'text-blue-600',
  tempo: 'text-green-600',
  threshold: 'text-orange-600',
  vo2max: 'text-red-600',
  sprint: 'text-purple-600',
  recovery: 'text-gray-600',
  custom: 'text-cyan-600',
};

export function WorkoutDetail({
  workout,
  onClose,
  onSchedule,
  onEdit,
  onDelete,
  onDownloadZWO,
  onDownloadFIT,
}: WorkoutDetailProps) {
  const intervalCount = workout.intervals?.length || 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-white text-gray-900 dark:text-gray-900 shadow-2xl">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-3xl mb-2">{workout.name}</CardTitle>
              {workout.description && (
                <p className="text-muted-foreground">{workout.description}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                <span
                  className={cn(
                    'px-3 py-1 text-sm font-medium rounded-full capitalize',
                    workoutTypeColors[workout.workout_type]
                  )}
                >
                  {workout.workout_type}
                </span>
                {workout.generated_by_ai && (
                  <span className="px-3 py-1 text-sm rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    AI Generated
                  </span>
                )}
              </div>
            </div>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Clock className="w-5 h-5 text-muted-foreground" />
                <span className="text-2xl font-bold">{workout.duration_minutes}</span>
              </div>
              <p className="text-sm text-muted-foreground">minutes</p>
            </div>

            {workout.tss && (
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Zap className="w-5 h-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">{workout.tss}</span>
                </div>
                <p className="text-sm text-muted-foreground">TSS</p>
              </div>
            )}

            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-2xl font-bold">{intervalCount}</span>
              </div>
              <p className="text-sm text-muted-foreground">intervals</p>
            </div>
          </div>

          {/* Interval Visualizer */}
          {workout.intervals && workout.intervals.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Workout Structure</h3>
              <IntervalVisualizer intervals={workout.intervals} />
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-4 border-t">
            {onSchedule && (
              <Button onClick={() => onSchedule(workout)}>
                <Calendar className="w-4 h-4 mr-2" />
                Schedule Workout
              </Button>
            )}

            {onEdit && (
              <Button variant="outline" onClick={() => onEdit(workout)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}

            {onDownloadZWO && (
              <Button variant="outline" onClick={() => onDownloadZWO(workout)}>
                <Download className="w-4 h-4 mr-2" />
                Download ZWO
              </Button>
            )}

            {onDownloadFIT && (
              <Button variant="outline" onClick={() => onDownloadFIT(workout)}>
                <Download className="w-4 h-4 mr-2" />
                Download FIT
              </Button>
            )}

            {onDelete && (
              <Button variant="destructive" onClick={() => onDelete(workout)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
          </div>

          {/* AI Generation Info */}
          {workout.ai_prompt && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2 text-sm">AI Generation Prompt</h4>
              <p className="text-sm text-muted-foreground">{workout.ai_prompt}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
