import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import type { UnacknowledgedActivity, ActivityFeedback } from '../../services/activityFeedbackService';

interface PostRideModalProps {
  activity: UnacknowledgedActivity;
  displayMode?: 'simple' | 'advanced'; // deprecated — always renders full layout
  onAcknowledge: (feedback: ActivityFeedback) => void;
  onSkip: () => void;
  onNavigateToChat?: (message: string) => void;
  activityNumber: number;
  totalActivities: number;
}

function formatDistance(meters: number | null): string | null {
  if (meters == null) return null;
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const RPE_OPTIONS = [
  { value: 1, emoji: '\u{1F634}', label: 'Very easy' },
  { value: 2, emoji: '\u{1F642}', label: 'Easy' },
  { value: 3, emoji: '\u{1F624}', label: 'Moderate' },
  { value: 4, emoji: '\u{1F4AA}', label: 'Hard' },
  { value: 5, emoji: '\u{1F525}', label: 'Max' },
] as const;

const WORKOUT_TYPE_LABELS: Record<string, string> = {
  endurance: 'Endurance',
  tempo: 'Tempo',
  threshold: 'Threshold',
  vo2max: 'VO2max',
  sprint: 'Sprint',
  recovery: 'Recovery',
  custom: 'Custom',
};

function PlannedWorkoutCard({
  activity,
  wasPlanned,
  setWasPlanned,
  showAdaptPrompt,
  onAdapt,
  onDeclineAdapt,
}: {
  activity: UnacknowledgedActivity;
  wasPlanned: boolean | null;
  setWasPlanned: (v: boolean) => void;
  showAdaptPrompt: boolean;
  onAdapt: () => void;
  onDeclineAdapt: () => void;
}) {
  const planned = activity.plannedWorkout;
  if (!planned) return null;

  const effectiveWasPlanned = wasPlanned ?? (activity.matchConfidence === 'high' ? true : null);

  return (
    <div className="border-l-4 border-blue-500 bg-blue-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Planned for today</p>
          <p className="font-bold text-gray-800">{planned.workoutName}</p>
        </div>
        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
          {WORKOUT_TYPE_LABELS[planned.workoutType] || planned.workoutType}
        </span>
      </div>
      <div className="flex gap-4 text-sm text-gray-600">
        <span>{planned.plannedDuration}min</span>
        {planned.plannedTSS && <span>TSS {Math.round(planned.plannedTSS)}</span>}
      </div>
      {planned.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{planned.description}</p>
      )}
      <div className="pt-2 border-t border-blue-200">
        {!showAdaptPrompt ? (
          <>
            <p className="text-sm font-medium text-gray-700 mb-2">Was this your planned workout?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setWasPlanned(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
                  effectiveWasPlanned === true
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => setWasPlanned(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
                  effectiveWasPlanned === false
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                No
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-800 mb-1">Want to adapt your training plan?</p>
            <p className="text-xs text-gray-500 mb-3">Your coach can suggest changes based on what you did instead.</p>
            <div className="flex gap-2">
              <button
                onClick={onAdapt}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border-2 border-green-500 bg-green-50 text-green-700 transition-all hover:bg-green-100"
              >
                Yes, adapt
              </button>
              <button
                onClick={onDeclineAdapt}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border-2 border-gray-200 text-gray-500 hover:border-gray-300 transition-all"
              >
                No thanks
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function PostRideModal({
  activity,
  displayMode,
  onAcknowledge,
  onSkip,
  onNavigateToChat,
  activityNumber,
  totalActivities,
}: PostRideModalProps) {
  const [notes, setNotes] = useState('');
  const [wasPlanned, setWasPlanned] = useState<boolean | null>(null);
  const [selectedRpe, setSelectedRpe] = useState<number | null>(null);
  const [showAdaptPrompt, setShowAdaptPrompt] = useState(false);

  const distance = formatDistance(activity.distance_meters);
  const duration = formatDuration(activity.moving_time_seconds);
  const dateStr = formatDate(activity.start_date);

  const planned = activity.plannedWorkout;
  const effectiveWasPlanned = wasPlanned ?? (planned && activity.matchConfidence === 'high' ? true : null);

  const buildFeedback = (rpe?: number): ActivityFeedback => ({
    perceived_effort: rpe,
    notes: notes.trim() || undefined,
    was_planned_workout: planned ? effectiveWasPlanned ?? undefined : undefined,
    calendar_entry_id: planned ? planned.calendarEntryId : undefined,
  });

  const handleSetWasPlanned = (v: boolean) => {
    setWasPlanned(v);
    if (!v && planned) {
      setShowAdaptPrompt(true);
    }
  };

  const handleAdapt = async () => {
    await onAcknowledge(buildFeedback(selectedRpe ?? undefined));
    const msg = `I just finished "${activity.name}" but it wasn't my planned workout "${planned?.workoutName}". Can you help me adapt my training plan?`;
    onNavigateToChat?.(msg);
  };

  const handleDeclineAdapt = () => {
    setShowAdaptPrompt(false);
  };

  const stats = [
    distance ? { label: 'Distance', value: distance } : null,
    duration ? { label: 'Duration', value: duration } : null,
    activity.tss != null ? { label: 'TSS', value: String(Math.round(activity.tss)) } : null,
    activity.average_watts != null ? { label: 'Avg Power', value: `${Math.round(activity.average_watts)}W` } : null,
    activity.calories != null ? { label: 'Calories', value: `${Math.round(activity.calories)}` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-400 to-rose-500 text-white p-6 rounded-t-2xl relative">
          <button onClick={onSkip} className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <div className="text-xs font-medium text-white/70 mb-1">
            {totalActivities > 1 ? `Activity ${activityNumber} of ${totalActivities}` : 'New activity'}
          </div>
          <h2 className="text-2xl font-bold leading-tight">{activity.name}</h2>
          <p className="text-orange-100 text-sm mt-0.5">{dateStr}</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats row */}
          {stats.length > 0 && (
            <div className={`grid gap-3 ${stats.length <= 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
              {stats.map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-gray-800">{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Planned workout */}
          <PlannedWorkoutCard activity={activity} wasPlanned={wasPlanned} setWasPlanned={handleSetWasPlanned} showAdaptPrompt={showAdaptPrompt} onAdapt={handleAdapt} onDeclineAdapt={handleDeclineAdapt} />

          {/* RPE */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">How did it feel?</p>
            <div className="grid grid-cols-5 gap-2">
              {RPE_OPTIONS.map(({ value, emoji, label }) => (
                <button
                  key={value}
                  onClick={() => setSelectedRpe(value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                    selectedRpe === value
                      ? 'border-orange-400 bg-orange-50 text-orange-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-xl">{emoji}</span>
                  <span className="text-xs font-medium leading-tight text-center">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Anything worth remembering?
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this ride..."
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => onAcknowledge(buildFeedback(selectedRpe ?? undefined))}
              className="flex-1 bg-gradient-to-r from-orange-400 to-rose-500 hover:from-orange-500 hover:to-rose-600 text-white"
            >
              Save
            </Button>
            <button
              onClick={onSkip}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
