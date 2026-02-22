import { X, Check, Trash2, Download, Clock, Zap } from 'lucide-react';
import type { CalendarEntry } from '../../services/calendarService';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { IntervalVisualizer } from '../workout/IntervalVisualizer';

interface CalendarDayDetailProps {
  date: Date;
  entries: CalendarEntry[];
  onClose: () => void;
  onComplete?: (entry: CalendarEntry) => void;
  onDelete?: (entry: CalendarEntry) => void;
  onDownloadZWO?: (entry: CalendarEntry) => void;
  onDownloadFIT?: (entry: CalendarEntry) => void;
}

const formatDate = (date: Date): string => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return date.toLocaleDateString(undefined, options);
};

export function CalendarDayDetail({
  date,
  entries,
  onClose,
  onComplete,
  onDelete,
  onDownloadZWO,
  onDownloadFIT,
}: CalendarDayDetailProps) {
  const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
  const isToday = date.toDateString() === new Date().toDateString();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-white text-gray-900 dark:text-gray-900">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{formatDate(date)}</CardTitle>
              {isToday && (
                <span className="text-sm text-primary font-medium">Today</span>
              )}
              {isPast && !isToday && (
                <span className="text-sm text-muted-foreground">Past</span>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {entries.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No workouts scheduled for this day
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Drag a workout from the library to schedule it
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <Card key={entry.id} className="overflow-hidden">
                  <CardContent className="p-6">
                    {entry.workouts && (
                      <div className="space-y-4">
                        {/* Workout Header */}
                        <div>
                          <h3 className="text-2xl font-bold mb-2">{entry.workouts.name}</h3>
                          {entry.workouts.description && (
                            <p className="text-muted-foreground">{entry.workouts.description}</p>
                          )}
                        </div>

                        {/* Status badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {entry.completed ? (
                            <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 flex items-center gap-1">
                              <Check className="w-4 h-4" />
                              Completed
                            </span>
                          ) : isPast ? (
                            <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                              Missed
                            </span>
                          ) : isToday ? (
                            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              Today
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                              Scheduled
                            </span>
                          )}

                          {entry.ai_rationale && (
                            <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                              AI Scheduled
                            </span>
                          )}

                          <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 capitalize">
                            {entry.workouts.workout_type}
                          </span>
                        </div>

                        {/* Workout Stats */}
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="flex items-center justify-center gap-2 mb-1">
                              <Clock className="w-5 h-5 text-muted-foreground" />
                              <span className="text-2xl font-bold">{entry.workouts.duration_minutes}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">minutes</p>
                          </div>

                          {entry.workouts.tss && (
                            <div className="text-center p-3 bg-muted rounded-lg">
                              <div className="flex items-center justify-center gap-2 mb-1">
                                <Zap className="w-5 h-5 text-muted-foreground" />
                                <span className="text-2xl font-bold">{entry.workouts.tss}</span>
                              </div>
                              <p className="text-sm text-muted-foreground">TSS</p>
                            </div>
                          )}

                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="flex items-center justify-center gap-2 mb-1">
                              <span className="text-2xl font-bold">{entry.workouts.intervals?.length || 0}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">intervals</p>
                          </div>
                        </div>

                        {/* Interval Visualizer */}
                        {entry.workouts.intervals && entry.workouts.intervals.length > 0 && (
                          <div>
                            <h4 className="text-lg font-semibold mb-3">Workout Structure</h4>
                            <IntervalVisualizer intervals={entry.workouts.intervals} />
                          </div>
                        )}

                        {/* AI Rationale */}
                        {entry.ai_rationale && (
                          <div className="text-sm bg-purple-50 dark:bg-purple-950 p-3 rounded-lg border border-purple-200 dark:border-purple-800">
                            <span className="font-medium text-purple-900 dark:text-purple-100">AI Coach: </span>
                            <span className="text-purple-800 dark:text-purple-200">{entry.ai_rationale}</span>
                          </div>
                        )}

                        {/* Notes */}
                        {entry.notes && (
                          <div className="text-sm bg-muted/50 p-3 rounded-lg">
                            <span className="font-medium">Notes: </span>
                            {entry.notes}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 flex-wrap pt-2 border-t">
                          {!entry.completed && (isToday || isPast) && onComplete && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => onComplete(entry)}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Mark Complete
                            </Button>
                          )}

                          {onDownloadZWO && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onDownloadZWO(entry)}
                              title="Download ZWO (Zwift)"
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download ZWO
                            </Button>
                          )}

                          {onDownloadFIT && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onDownloadFIT(entry)}
                              title="Download FIT (Garmin)"
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download FIT
                            </Button>
                          )}

                          {onDelete && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => onDelete(entry)}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Quick tips */}
          {entries.length === 0 && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="font-medium mb-2 text-sm">Quick Tips</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Ask the AI coach to create workouts for you</li>
                <li>• Drag workouts from your library to schedule them</li>
                <li>• Move scheduled workouts by dragging to different days</li>
                <li>• Generate a complete training plan with the AI</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
