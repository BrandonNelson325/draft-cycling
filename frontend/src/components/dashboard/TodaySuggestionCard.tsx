import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { dailyAnalysisService, TodaySuggestion } from '../../services/dailyAnalysisService';

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
            {hasRiddenToday ? "Today's Recap" : "Today's Plan"}
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

        {/* Today's planned workout (pre-ride) */}
        {!hasRiddenToday && suggestion.todaysWorkout && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">
              Planned
            </p>
            <p className="text-sm font-medium text-gray-800">{suggestion.todaysWorkout.name}</p>
            <p className="text-xs text-gray-500">
              {suggestion.todaysWorkout.duration}min · {suggestion.todaysWorkout.type} · {suggestion.todaysWorkout.tss} TSS
            </p>
          </div>
        )}

        {/* Suggested workout (pre-ride, no plan) */}
        {!hasRiddenToday && suggestion.suggestedWorkout && !suggestion.todaysWorkout && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
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

        {/* Tomorrow's workout preview */}
        {hasRiddenToday && suggestion.tomorrowsWorkout && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
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
    </Card>
  );
}
