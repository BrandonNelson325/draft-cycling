import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import type { UnacknowledgedActivity, ActivityFeedback } from '../../services/activityFeedbackService';

interface PostRideModalProps {
  activity: UnacknowledgedActivity;
  displayMode: 'simple' | 'advanced';
  onAcknowledge: (feedback: ActivityFeedback) => void;
  onSkip: () => void;
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
  { value: 1, emoji: '😴', label: 'Very easy' },
  { value: 2, emoji: '🙂', label: 'Easy' },
  { value: 3, emoji: '😤', label: 'Moderate' },
  { value: 4, emoji: '💪', label: 'Hard' },
  { value: 5, emoji: '🔥', label: 'Max' },
] as const;

export function PostRideModal({
  activity,
  displayMode,
  onAcknowledge,
  onSkip,
  activityNumber,
  totalActivities,
}: PostRideModalProps) {
  const [notes, setNotes] = useState('');

  const distance = formatDistance(activity.distance_meters);
  const duration = formatDuration(activity.moving_time_seconds);
  const dateStr = formatDate(activity.start_date);

  if (displayMode === 'simple') {
    return <SimpleModal
      activity={activity}
      distance={distance}
      duration={duration}
      dateStr={dateStr}
      activityNumber={activityNumber}
      totalActivities={totalActivities}
      onRpeSelect={(v) => onAcknowledge({ perceived_effort: v })}
      onSkip={onSkip}
    />;
  }

  return <AdvancedModal
    activity={activity}
    distance={distance}
    duration={duration}
    dateStr={dateStr}
    notes={notes}
    setNotes={setNotes}
    activityNumber={activityNumber}
    totalActivities={totalActivities}
    onAcknowledge={onAcknowledge}
    onSkip={onSkip}
  />;
}

// ── Simple mode ──────────────────────────────────────────────────────────────

interface SimpleModeProps {
  activity: UnacknowledgedActivity;
  distance: string | null;
  duration: string | null;
  dateStr: string;
  activityNumber: number;
  totalActivities: number;
  onRpeSelect: (value: number) => void;
  onSkip: () => void;
}

function SimpleModal({
  activity,
  distance,
  duration,
  dateStr,
  activityNumber,
  totalActivities,
  onRpeSelect,
  onSkip,
}: SimpleModeProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-400 to-rose-500 text-white p-5 rounded-t-2xl relative">
          <button onClick={onSkip} className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <div className="text-xs font-medium text-white/70 mb-1">
            {totalActivities > 1 ? `Activity ${activityNumber} of ${totalActivities}` : 'New activity'}
          </div>
          <h2 className="text-xl font-bold leading-tight">{activity.name}</h2>
          <p className="text-orange-100 text-sm mt-0.5">{dateStr}</p>
        </div>

        <div className="p-5 space-y-5">
          {/* Stats */}
          <div className="flex gap-4">
            {distance && (
              <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-gray-800">{distance}</div>
                <div className="text-xs text-gray-500">Distance</div>
              </div>
            )}
            {duration && (
              <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-gray-800">{duration}</div>
                <div className="text-xs text-gray-500">Duration</div>
              </div>
            )}
          </div>

          {/* RPE */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3 text-center">How did that feel?</p>
            <div className="flex justify-between gap-1">
              {RPE_OPTIONS.map(({ value, emoji, label }) => (
                <button
                  key={value}
                  onClick={() => onRpeSelect(value)}
                  className="flex-1 flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-orange-50 transition-colors group"
                  title={label}
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">{emoji}</span>
                  <span className="text-xs text-gray-500 leading-tight text-center">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Skip */}
          <div className="text-center">
            <button
              onClick={onSkip}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Advanced mode ─────────────────────────────────────────────────────────────

interface AdvancedModeProps {
  activity: UnacknowledgedActivity;
  distance: string | null;
  duration: string | null;
  dateStr: string;
  notes: string;
  setNotes: (v: string) => void;
  activityNumber: number;
  totalActivities: number;
  onAcknowledge: (feedback: ActivityFeedback) => void;
  onSkip: () => void;
}

function AdvancedModal({
  activity,
  distance,
  duration,
  dateStr,
  notes,
  setNotes,
  activityNumber,
  totalActivities,
  onAcknowledge,
  onSkip,
}: AdvancedModeProps) {
  const [selectedRpe, setSelectedRpe] = useState<number | null>(null);

  const stats = [
    distance ? { label: 'Distance', value: distance } : null,
    duration ? { label: 'Duration', value: duration } : null,
    activity.tss != null ? { label: 'TSS', value: String(Math.round(activity.tss)) } : null,
    activity.average_watts != null ? { label: 'Avg Power', value: `${Math.round(activity.average_watts)}W` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const handleSave = () => {
    onAcknowledge({
      perceived_effort: selectedRpe ?? undefined,
      notes: notes.trim() || undefined,
    });
  };

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
              onClick={handleSave}
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
