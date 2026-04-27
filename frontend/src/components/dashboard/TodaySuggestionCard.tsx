import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { WorkoutDetail } from '../workout/WorkoutDetail';
import { dailyAnalysisService } from '../../services/dailyAnalysisService';
import type { TodaySuggestion } from '../../services/dailyAnalysisService';
import { workoutService } from '../../services/workoutService';
import { calendarService } from '../../services/calendarService';
import type { Workout } from '../../services/workoutService';

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  fresh: { bg: 'bg-emerald-900/50', text: 'text-emerald-400', label: 'Fresh' },
  'well-recovered': { bg: 'bg-blue-900/50', text: 'text-blue-400', label: 'Recovered' },
  'slightly-tired': { bg: 'bg-amber-900/50', text: 'text-amber-400', label: 'Tired' },
  fatigued: { bg: 'bg-red-900/50', text: 'text-red-400', label: 'Fatigued' },
};

const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  'proceed-as-planned': { label: 'Good to go as planned', color: 'text-emerald-400' },
  'make-easier': { label: 'Consider making it easier', color: 'text-amber-400' },
  'add-rest': { label: 'Rest day recommended', color: 'text-red-400' },
  'can-do-more': { label: 'You can push harder today', color: 'text-blue-400' },
  'suggested-workout': { label: 'Suggested for today', color: 'text-purple-400' },
};

export function TodaySuggestionCard() {
  const [data, setData] = useState<TodaySuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [loadingWorkoutId, setLoadingWorkoutId] = useState<string | null>(null);
  const [adjustmentBusy, setAdjustmentBusy] = useState(false);

  const handleAcceptAdjustment = async () => {
    if (!data?.suggestion?.adjustment || adjustmentBusy) return;
    setAdjustmentBusy(true);
    try {
      await dailyAnalysisService.acceptAdjustment(
        data.suggestion.adjustment.kind as 'rest' | 'easier',
        data.suggestion.adjustment.reason
      );
      const fresh = await dailyAnalysisService.getTodaySuggestion();
      setData(fresh);
    } catch (err) {
      console.error('Failed to accept adjustment:', err);
    } finally {
      setAdjustmentBusy(false);
    }
  };

  const handleDismissAdjustment = async () => {
    if (adjustmentBusy) return;
    setAdjustmentBusy(true);
    try {
      await dailyAnalysisService.dismissAdjustment();
      const fresh = await dailyAnalysisService.getTodaySuggestion();
      setData(fresh);
    } catch (err) {
      console.error('Failed to dismiss adjustment:', err);
    } finally {
      setAdjustmentBusy(false);
    }
  };

  const handleWorkoutClick = async (workoutId: string | undefined) => {
    if (!workoutId || loadingWorkoutId) return;
    setLoadingWorkoutId(workoutId);
    try {
      const workout = await workoutService.getWorkout(workoutId);
      setSelectedWorkout(workout);
    } catch (err) {
      console.error('Failed to load workout:', err);
    } finally {
      setLoadingWorkoutId(null);
    }
  };

  const handleSchedule = async (workout: Workout) => {
    try {
      const targetDate = data?.hasRiddenToday
        ? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1)
        : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
      await calendarService.scheduleWorkout(workout.id, targetDate);
      setSelectedWorkout(null);
      const fresh = await dailyAnalysisService.getTodaySuggestion();
      setData(fresh);
    } catch (err) {
      console.error('Failed to schedule workout:', err);
    }
  };

  useEffect(() => {
    dailyAnalysisService
      .getTodaySuggestion()
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.suggestion) return null;

  const { suggestion, hasRiddenToday } = data;
  const statusInfo = STATUS_CONFIG[suggestion.status] || STATUS_CONFIG['well-recovered'];
  const actionInfo = ACTION_CONFIG[suggestion.suggestedAction] || ACTION_CONFIG['proceed-as-planned'];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {hasRiddenToday ? "Today's Recap" : suggestion.isRestDay ? "Rest Day" : "Today's Plan"}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>
              {statusInfo.label}
            </span>
            <span className="text-xs text-gray-500">
              TSB {suggestion.currentTSB.toFixed(0)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">{suggestion.summary}</p>

        {/* Today's completed rides (post-ride) */}
        {hasRiddenToday && suggestion.todaysRides.length > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1">
              Completed Today
            </p>
            {suggestion.todaysRides.map((ride, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{ride.name}</span>
                <span className="text-gray-500">
                  {ride.duration}min · {ride.tss} TSS
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Coach override (pre-ride): AI thinks the plan should change */}
        {!hasRiddenToday && suggestion.todaysWorkout && suggestion.adjustment && suggestion.adjustment.kind !== 'none' && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
              Suggested
            </p>
            <p className="text-sm font-medium text-gray-800">{suggestion.adjustment.headline}</p>
            <p className="text-xs text-gray-600 mt-1">{suggestion.adjustment.reason}</p>
            <div className="flex gap-2 mt-3">
              {suggestion.adjustment.kind === 'rest' && (
                <button
                  onClick={handleAcceptAdjustment}
                  disabled={adjustmentBusy}
                  className="flex-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                >
                  Take rest day
                </button>
              )}
              <button
                onClick={handleDismissAdjustment}
                disabled={adjustmentBusy}
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Keep planned
              </button>
            </div>
          </div>
        )}

        {/* Today's planned workout (pre-ride) — dimmed when there's an active override */}
        {!hasRiddenToday && suggestion.todaysWorkout && (
          <div
            className={`rounded-lg border border-blue-200 bg-blue-50 p-3 ${suggestion.todaysWorkout.workoutId ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${suggestion.adjustment && suggestion.adjustment.kind !== 'none' ? 'opacity-60' : ''}`}
            onClick={() => handleWorkoutClick(suggestion.todaysWorkout?.workoutId)}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">
              {suggestion.adjustment && suggestion.adjustment.kind !== 'none' ? 'Originally Planned' : 'Planned'}
            </p>
            <p className="text-sm font-medium text-gray-800">{suggestion.todaysWorkout.name}</p>
            <p className="text-xs text-gray-500">
              {suggestion.todaysWorkout.duration}min · {suggestion.todaysWorkout.type} · {suggestion.todaysWorkout.tss} TSS
            </p>
          </div>
        )}

        {/* Rest day (pre-ride): explicit rest, no workout planned */}
        {!hasRiddenToday && suggestion.isRestDay && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1">
              Today
            </p>
            <p className="text-sm font-medium text-gray-800">Rest day</p>
            <p className="text-xs text-gray-500 mt-1">Recovery is part of the plan.</p>
          </div>
        )}

        {/* Suggested workout (pre-ride, no plan, not a rest day) */}
        {!hasRiddenToday && !suggestion.isRestDay && suggestion.suggestedWorkout && !suggestion.todaysWorkout && (
          <div
            className={`rounded-lg border border-purple-200 bg-purple-50 p-3 ${suggestion.suggestedWorkout.workoutId ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
            onClick={() => handleWorkoutClick(suggestion.suggestedWorkout?.workoutId)}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 mb-1">
              Suggested
            </p>
            <p className="text-sm font-medium text-gray-800">{suggestion.suggestedWorkout.name}</p>
            <p className="text-xs text-gray-500">
              {suggestion.suggestedWorkout.duration}min · {suggestion.suggestedWorkout.type}
            </p>
            <p className="text-xs text-gray-500 mt-1">{suggestion.suggestedWorkout.description}</p>
          </div>
        )}

        {/* Tomorrow's workout preview (shown after a ride or on rest days) */}
        {(hasRiddenToday || suggestion.isRestDay) && suggestion.tomorrowsWorkout && (
          <div
            className={`rounded-lg border border-blue-200 bg-blue-50 p-3 ${suggestion.tomorrowsWorkout.workoutId ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
            onClick={() => handleWorkoutClick(suggestion.tomorrowsWorkout?.workoutId)}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">
              Tomorrow
            </p>
            <p className="text-sm font-medium text-gray-800">{suggestion.tomorrowsWorkout.name}</p>
            <p className="text-xs text-gray-500">
              {suggestion.tomorrowsWorkout.duration}min · {suggestion.tomorrowsWorkout.type} · {suggestion.tomorrowsWorkout.tss} TSS
            </p>
          </div>
        )}

        {/* Action + recommendation */}
        <div>
          <p className={`text-sm font-semibold ${actionInfo.color}`}>{actionInfo.label}</p>
          <p className="text-sm text-gray-500">{suggestion.recommendation}</p>
        </div>

        {/* Chat link */}
        <Link
          to="/chat"
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Chat with Coach
        </Link>
      </CardContent>

      {selectedWorkout && (
        <WorkoutDetail
          workout={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          onSchedule={
            !suggestion.todaysWorkout?.workoutId || selectedWorkout.id !== suggestion.todaysWorkout.workoutId
              ? handleSchedule
              : undefined
          }
        />
      )}
    </Card>
  );
}
