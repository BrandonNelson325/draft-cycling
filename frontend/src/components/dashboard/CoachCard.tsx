import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Moon, Activity, Heart, Battery, TrendingUp, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { FreshnessGauge } from './FreshnessGauge';
import { dailyAnalysisService } from '../../services/dailyAnalysisService';
import type { TodaySuggestion } from '../../services/dailyAnalysisService';
import { trainingService } from '../../services/trainingService';
import { healthDataService } from '../../services/healthDataService';
import type { HealthData } from '../../services/healthDataService';

interface TrainingStatus {
  ctl: number;
  atl: number;
  tsb: number;
  form_status: string;
  last_updated: string;
}

export function CoachCard() {
  const [suggestion, setSuggestion] = useState<TodaySuggestion | null>(null);
  const [training, setTraining] = useState<TrainingStatus | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      dailyAnalysisService.getTodaySuggestion().catch(() => null),
      trainingService.getTrainingStatus().catch(() => null),
      healthDataService.getTodaysHealthData().catch(() => null),
    ]).then(([s, t, h]) => {
      setSuggestion(s);
      setTraining(t ?? null);
      setHealthData(h);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-2.5 bg-gray-200 rounded-full w-full" />
            <div className="h-16 bg-gray-200 rounded-xl w-1/3 mx-auto" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const tsb = training?.tsb ?? suggestion?.suggestion?.currentTSB ?? 0;
  const s = suggestion?.suggestion;
  const hasRidden = suggestion?.hasRiddenToday ?? false;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <h3 className="text-lg font-semibold">Training Status</h3>

        {/* Freshness Gauge — the visual hook */}
        <FreshnessGauge tsb={tsb} ctl={training?.ctl ?? 0} atl={training?.atl ?? 0} />

        {/* AI summary */}
        {s && (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 leading-relaxed">{s.summary}</p>

            {/* Today's completed rides (post-ride) */}
            {hasRidden && s.todaysRides.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
                  Completed Today
                </p>
                {s.todaysRides.map((ride, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-gray-700">{ride.name}</span>
                    <span className="text-gray-500">{ride.duration}min · {ride.tss} TSS</span>
                  </div>
                ))}
              </div>
            )}

            {/* Today's planned workout (pre-ride) */}
            {!hasRidden && s.todaysWorkout && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 mb-1">Planned</p>
                <p className="text-sm font-medium text-gray-800">{s.todaysWorkout.name}</p>
                <p className="text-xs text-gray-500">
                  {s.todaysWorkout.duration}min · {s.todaysWorkout.type} · {s.todaysWorkout.tss} TSS
                </p>
              </div>
            )}

            {/* Suggested workout or rest day (pre-ride, no plan) */}
            {!hasRidden && s.suggestedWorkout && !s.todaysWorkout && (
              <div className={`rounded-lg border p-3 ${s.suggestedWorkout.type === 'rest' ? 'border-green-200 bg-green-50' : 'border-purple-200 bg-purple-50'}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${s.suggestedWorkout.type === 'rest' ? 'text-green-700' : 'text-purple-700'}`}>
                  {s.suggestedWorkout.type === 'rest' ? 'Rest Day' : 'Suggested'}
                </p>
                <p className="text-sm font-medium text-gray-800">{s.suggestedWorkout.name}</p>
                {s.suggestedWorkout.type !== 'rest' && (
                  <p className="text-xs text-gray-500">
                    {s.suggestedWorkout.duration}min · {s.suggestedWorkout.type}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">{s.suggestedWorkout.description}</p>
              </div>
            )}

            {/* Tomorrow's scheduled workout (post-ride) */}
            {hasRidden && s.tomorrowsWorkout && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 mb-1">Tomorrow</p>
                <p className="text-sm font-medium text-gray-800">{s.tomorrowsWorkout.name}</p>
                <p className="text-xs text-gray-500">
                  {s.tomorrowsWorkout.duration}min · {s.tomorrowsWorkout.type} · {s.tomorrowsWorkout.tss} TSS
                </p>
              </div>
            )}

            {/* Suggested tomorrow workout or rest day (post-ride, no scheduled workout) */}
            {hasRidden && !s.tomorrowsWorkout && s.suggestedWorkout && (
              <div className={`rounded-lg border p-3 ${s.suggestedWorkout.type === 'rest' ? 'border-green-200 bg-green-50' : 'border-purple-200 bg-purple-50'}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${s.suggestedWorkout.type === 'rest' ? 'text-green-700' : 'text-purple-700'}`}>
                  {s.suggestedWorkout.type === 'rest' ? 'Rest Day Tomorrow' : 'Suggested for Tomorrow'}
                </p>
                <p className="text-sm font-medium text-gray-800">{s.suggestedWorkout.name}</p>
                {s.suggestedWorkout.type !== 'rest' && (
                  <p className="text-xs text-gray-500">
                    {s.suggestedWorkout.duration}min · {s.suggestedWorkout.type}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-1">{s.suggestedWorkout.description}</p>
              </div>
            )}

            {/* Recommendation */}
            <p className="text-sm text-gray-500">{s.recommendation}</p>
          </div>
        )}

        {/* Wellness pills */}
        {healthData && <WellnessPills data={healthData} />}

        {/* Expandable CTL/ATL details */}
        {training && (
          <div className="border-t pt-2">
            <button
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors w-full"
            >
              {detailsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>Fitness & fatigue details</span>
            </button>
            {detailsOpen && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="border-l-2 border-blue-500 pl-2">
                  <span className="text-[10px] text-gray-400 uppercase">Fitness</span>
                  <p className="text-lg font-bold">{training.ctl.toFixed(1)}</p>
                </div>
                <div className="border-l-2 border-gray-300 pl-2">
                  <span className="text-[10px] text-gray-400 uppercase">Fatigue</span>
                  <p className="text-lg font-bold">{training.atl.toFixed(1)}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat link */}
        <Link
          to="/chat"
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Chat with Coach
        </Link>
      </CardContent>
    </Card>
  );
}

function WellnessPills({ data }: { data: HealthData }) {
  const pills: { icon: React.ReactNode; value: string; label: string; bg: string }[] = [];

  if (data.sleep_hours) {
    pills.push({
      icon: <Moon className="w-3.5 h-3.5 text-blue-600" />,
      value: `${data.sleep_hours}h`,
      label: 'Sleep',
      bg: 'bg-blue-50',
    });
  }
  if (data.hrv) {
    pills.push({
      icon: <Activity className="w-3.5 h-3.5 text-green-600" />,
      value: `${data.hrv}ms`,
      label: 'HRV',
      bg: 'bg-green-50',
    });
  }
  if (data.resting_heart_rate) {
    pills.push({
      icon: <Heart className="w-3.5 h-3.5 text-red-600" />,
      value: `${data.resting_heart_rate}`,
      label: 'RHR',
      bg: 'bg-red-50',
    });
  }
  if (data.body_battery != null) {
    pills.push({
      icon: <Battery className="w-3.5 h-3.5 text-amber-600" />,
      value: `${data.body_battery}%`,
      label: 'Battery',
      bg: 'bg-amber-50',
    });
  }
  if (data.readiness_score != null) {
    pills.push({
      icon: <TrendingUp className="w-3.5 h-3.5 text-purple-600" />,
      value: `${data.readiness_score}%`,
      label: 'Ready',
      bg: 'bg-purple-50',
    });
  }
  if (data.stress_level) {
    pills.push({
      icon: <AlertCircle className="w-3.5 h-3.5 text-orange-600" />,
      value: `${data.stress_level}/5`,
      label: 'Stress',
      bg: 'bg-orange-50',
    });
  }

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((p, i) => (
        <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full ${p.bg}`}>
          {p.icon}
          <span className="text-xs font-semibold">{p.value}</span>
          <span className="text-[10px] text-gray-400">{p.label}</span>
        </div>
      ))}
    </div>
  );
}
