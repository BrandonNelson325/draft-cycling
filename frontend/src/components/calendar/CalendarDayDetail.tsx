import { useState } from 'react';
import { X, Check, Trash2, Download, Clock, Zap, Activity, Pencil } from 'lucide-react';
import type { CalendarEntry, StravaActivity } from '../../services/calendarService';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { IntervalVisualizer } from '../workout/IntervalVisualizer';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';
import { activityFeedbackService } from '../../services/activityFeedbackService';

const RPE_DISPLAY: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '😴', label: 'Very Easy' },
  2: { emoji: '🙂', label: 'Easy' },
  3: { emoji: '😤', label: 'Moderate' },
  4: { emoji: '💪', label: 'Hard' },
  5: { emoji: '🔥', label: 'Max' },
};

interface CalendarDayDetailProps {
  date: Date;
  entries: CalendarEntry[];
  stravaActivities?: StravaActivity[];
  onClose: () => void;
  onComplete?: (entry: CalendarEntry) => void;
  onDelete?: (entry: CalendarEntry) => void;
  onDownloadZWO?: (entry: CalendarEntry) => void;
  onDownloadFIT?: (entry: CalendarEntry) => void;
}

function RpeEditor({ activity }: { activity: StravaActivity }) {
  const [editing, setEditing] = useState(false);
  const [selectedRpe, setSelectedRpe] = useState<number | null>(null);
  const [savedEffort, setSavedEffort] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const displayedEffort = savedEffort ?? activity.perceived_effort;
  const showPicker = !displayedEffort || editing;

  const handleSave = async (effort: number) => {
    setSaving(true);
    try {
      await activityFeedbackService.acknowledge(activity.id, { perceived_effort: effort });
      setSavedEffort(effort);
      setEditing(false);
      setSelectedRpe(null);
    } catch {
      // user can try again
    } finally {
      setSaving(false);
    }
  };

  if (showPicker) {
    return (
      <div className="p-3 bg-muted/50 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{editing ? 'Update effort' : 'How hard was this ride?'}</p>
          {editing && (
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setEditing(false); setSelectedRpe(null); }}>
              Cancel
            </button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(RPE_DISPLAY).map(([val, { emoji, label }]) => {
            const num = Number(val);
            const isSelected = selectedRpe === num || (editing && !selectedRpe && displayedEffort === num);
            return (
              <button
                key={num}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-colors ${
                  isSelected ? 'border-blue-500 bg-blue-500/10' : 'border-transparent bg-muted hover:bg-muted/80'
                }`}
                onClick={() => setSelectedRpe(num)}
              >
                <span className="text-xl">{emoji}</span>
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </button>
            );
          })}
        </div>
        {selectedRpe && (!editing || selectedRpe !== displayedEffort) && (
          <button
            className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            disabled={saving}
            onClick={() => handleSave(selectedRpe)}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
    );
  }

  if (displayedEffort && RPE_DISPLAY[displayedEffort]) {
    return (
      <div
        className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors group"
        onClick={() => { setEditing(true); setSelectedRpe(null); }}
      >
        <span className="text-2xl">{RPE_DISPLAY[displayedEffort].emoji}</span>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">Perceived Effort</p>
          <p className="font-semibold">{RPE_DISPLAY[displayedEffort].label}</p>
        </div>
        <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    );
  }

  return null;
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
  stravaActivities = [],
  onClose,
  onComplete,
  onDelete,
  onDownloadZWO,
  onDownloadFIT,
}: CalendarDayDetailProps) {
  const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
  const isToday = date.toDateString() === new Date().toDateString();
  const user = useAuthStore((state) => state.user);
  const units = getConversionUtils(user);

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

          {/* Strava Activities */}
          {stravaActivities.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="w-5 h-5 text-orange-500" />
                Completed Activities
              </h3>
              {stravaActivities.map((activity) => {
                const duration = activity.moving_time_seconds
                  ? `${Math.floor(activity.moving_time_seconds / 3600)}h ${Math.round((activity.moving_time_seconds % 3600) / 60)}m`
                  : null;

                const stats: { label: string; value: string }[] = [];
                if (activity.distance_meters > 0) {
                  stats.push({ label: units.distanceUnitShort, value: units.formatDistance(activity.distance_meters) });
                }
                if (duration) stats.push({ label: 'Duration', value: duration });
                if (activity.average_watts) stats.push({ label: 'Avg Power', value: `${Math.round(activity.average_watts)}W` });
                if (activity.tss) stats.push({ label: 'TSS', value: `${Math.round(activity.tss)}` });

                const secondaryStats: { label: string; value: string }[] = [];
                if (activity.total_elevation_gain) secondaryStats.push({ label: `Elevation (${units.elevationUnitShort})`, value: units.formatElevation(activity.total_elevation_gain) });
                if (activity.average_heartrate) secondaryStats.push({ label: 'Avg HR', value: `${Math.round(activity.average_heartrate)} bpm` });
                if (activity.max_heartrate) secondaryStats.push({ label: 'Max HR', value: `${Math.round(activity.max_heartrate)} bpm` });
                if (activity.max_watts) secondaryStats.push({ label: 'Max Power', value: `${Math.round(activity.max_watts)}W` });
                if (activity.weighted_average_watts) secondaryStats.push({ label: 'NP', value: `${Math.round(activity.weighted_average_watts)}W` });
                if (activity.intensity_factor) secondaryStats.push({ label: 'IF', value: activity.intensity_factor.toFixed(2) });
                if (activity.calories) secondaryStats.push({ label: 'Calories', value: `${Math.round(activity.calories)}` });

                return (
                  <Card key={activity.id} className="overflow-hidden border-orange-200 dark:border-orange-800">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-xl font-bold">{activity.name}</h4>
                        <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-sm whitespace-nowrap">
                          {activity.type === 'VirtualRide' ? 'Virtual' : activity.type}
                        </span>
                      </div>

                      {/* Primary stats */}
                      {stats.length > 0 && (
                        <div className={`grid gap-4 grid-cols-${Math.min(stats.length, 4)}`}>
                          {stats.map(({ label, value }) => (
                            <div key={label} className="text-center p-3 bg-muted rounded-lg">
                              <div className="text-2xl font-bold">{value}</div>
                              <p className="text-sm text-muted-foreground">{label}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Secondary stats */}
                      {secondaryStats.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {secondaryStats.map(({ label, value }) => (
                            <div key={label} className="p-2 bg-muted/50 rounded-lg">
                              <div className="text-sm font-semibold">{value}</div>
                              <p className="text-xs text-muted-foreground">{label}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* RPE */}
                      <RpeEditor activity={activity} />

                      {/* Notes */}
                      {activity.post_activity_notes && (
                        <div className="p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Notes</p>
                          <p className="text-sm">{activity.post_activity_notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Quick tips */}
          {entries.length === 0 && stravaActivities.length === 0 && (
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
