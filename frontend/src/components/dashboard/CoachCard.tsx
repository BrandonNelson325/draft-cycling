import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Activity, Heart, Battery, TrendingUp, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { FreshnessGauge, getStatus } from './FreshnessGauge';
import { WorkoutDetail } from '../workout/WorkoutDetail';
import { dailyAnalysisService } from '../../services/dailyAnalysisService';
import type { TodaySuggestion } from '../../services/dailyAnalysisService';
import { trainingService } from '../../services/trainingService';
import { dailyCheckInService, type DailyReadiness } from '../../services/dailyCheckInService';
import { healthDataService } from '../../services/healthDataService';
import type { HealthData } from '../../services/healthDataService';
import { workoutService } from '../../services/workoutService';
import { calendarService } from '../../services/calendarService';
import type { Workout } from '../../services/workoutService';

interface TrainingStatus {
  ctl: number;
  atl: number;
  tsb: number;
  form_status: string;
  last_updated: string;
}

export function CoachCard() {
  const [showDetail, setShowDetail] = useState(false);
  const [suggestion, setSuggestion] = useState<TodaySuggestion | null>(null);
  const [training, setTraining] = useState<TrainingStatus | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [readiness, setReadiness] = useState<DailyReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [loadingWorkoutId, setLoadingWorkoutId] = useState<string | null>(null);

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
      const targetDate = hasRidden
        ? new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1)
        : new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
      await calendarService.scheduleWorkout(workout.id, targetDate);
      setSelectedWorkout(null);
      const fresh = await dailyAnalysisService.getTodaySuggestion();
      setSuggestion(fresh);
    } catch (err) {
      console.error('Failed to schedule workout:', err);
    }
  };

  useEffect(() => {
    Promise.all([
      dailyAnalysisService.getTodaySuggestion().catch(() => null),
      trainingService.getTrainingStatus().catch(() => null),
      healthDataService.getTodaysHealthData().catch(() => null),
      dailyCheckInService.getDailyReadiness().catch(() => null),
    ]).then(([s, t, h, r]) => {
      setSuggestion(s);
      setTraining(t ?? null);
      setHealthData(h);
      setReadiness(r);
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

  // ── KISS layout: How am I? → What do I do? → Why (one line). Details on click. ──
  const form = getStatus(tsb, training?.ctl ?? 0, training?.atl ?? 0);
  const w = readiness?.wellness?.source === 'whoop' ? readiness.wellness : null;
  const latest = !w && readiness?.whoop?.connected ? readiness.whoop.latest : null;
  const recovery = w?.readinessScore ?? latest?.readinessScore ?? null;
  const hrvTrend = readiness?.hrvTrend && !readiness.hrvTrend.suspect ? readiness.hrvTrend : null;
  const hrv = w?.hrv ?? latest?.hrv ?? null;
  const sleep = w?.sleepSeconds ?? latest?.sleepSeconds ?? null;
  const need = w?.sleepNeedSeconds ?? latest?.sleepNeedSeconds ?? null;
  const rhr = w?.rhr ?? latest?.rhr ?? null;
  const strain = w?.dayStrain ?? latest?.dayStrain ?? null;

  type Call = { label: string; title: string; meta?: string; workoutId?: string; tone: string };
  let call: Call | null = null;
  if (s) {
    if (!hasRidden && s.todaysWorkout) call = { label: 'Today', title: clean(s.todaysWorkout.name), meta: `${s.todaysWorkout.duration} min · ${s.todaysWorkout.type}`, workoutId: s.todaysWorkout.workoutId, tone: 'text-blue-600' };
    else if (!hasRidden && s.isRestDay) call = { label: 'Today', title: 'Rest day', tone: 'text-green-600' };
    else if (!hasRidden && s.suggestedWorkout) call = { label: 'Today', title: clean(s.suggestedWorkout.name), meta: s.suggestedWorkout.type === 'rest' ? undefined : `${s.suggestedWorkout.duration} min · ${s.suggestedWorkout.type}`, workoutId: s.suggestedWorkout.workoutId, tone: s.suggestedWorkout.type === 'rest' ? 'text-green-600' : 'text-blue-600' };
    else if (hasRidden && s.tomorrowsWorkout) call = { label: 'Tomorrow', title: clean(s.tomorrowsWorkout.name), meta: `${s.tomorrowsWorkout.duration} min · ${s.tomorrowsWorkout.type}`, workoutId: s.tomorrowsWorkout.workoutId, tone: 'text-purple-600' };
    else if (hasRidden && s.suggestedWorkout) call = { label: 'Tomorrow', title: clean(s.suggestedWorkout.name), meta: s.suggestedWorkout.type === 'rest' ? undefined : `${s.suggestedWorkout.duration} min · ${s.suggestedWorkout.type}`, workoutId: s.suggestedWorkout.workoutId, tone: s.suggestedWorkout.type === 'rest' ? 'text-green-600' : 'text-purple-600' };
  }
  const why = s?.keyPoints?.[0] ?? firstSentence(s?.recommendation);
  const ride = hasRidden ? s?.todaysRides?.[0] : null;

  return (
    <Card>
      <CardContent className="p-5">
        {/* 1. How am I? — body + load */}
        <div className="flex items-center justify-between gap-3">
          {recovery != null ? (
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-12 h-12 shrink-0 rounded-full border-[3px] flex items-center justify-center text-sm font-extrabold ${recoveryClass(recovery)}`}>{recovery}%</div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">Recovery{latest ? ' (yesterday)' : ''} <span className="text-[10px] font-bold tracking-widest text-gray-400 ml-1">WHOOP</span></div>
                <div className="text-xs text-gray-500 truncate">{[hrv != null ? `HRV ${hrv}` : null, sleep != null ? `Sleep ${hm(sleep)}${need ? `/${hm(need)}` : ''}` : null].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ) : hrvTrend?.status ? (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">{HRV_LABEL[hrvTrend.status]}</div>
              {hrvTrend.hrvPct != null && <div className="text-xs text-gray-500">{hrvTrend.hrvPct > 0 ? '+' : ''}{hrvTrend.hrvPct}% vs your baseline</div>}
            </div>
          ) : <div />}
          <div className={`rounded-lg border-2 px-3 py-1 text-center shrink-0 ${FORM_CLASS[form.label] || 'border-gray-300 text-gray-600'}`}>
            <div className="text-[10px] font-bold tracking-wide text-gray-400">FORM</div>
            <div className="text-sm font-extrabold">{form.label}</div>
          </div>
        </div>

        {/* 2. What do I do? + 3. Why */}
        {call && (
          <div
            className={`mt-4 pt-3 border-t ${call.workoutId ? 'cursor-pointer' : ''}`}
            onClick={() => handleWorkoutClick(call?.workoutId)}
          >
            <div className={`text-[11px] font-bold uppercase tracking-wider ${call.tone}`}>{call.label}</div>
            <div className="text-lg font-bold text-gray-900">{call.title}</div>
            {call.meta && <div className="text-xs text-gray-500">{call.meta}</div>}
            {why && <p className="text-sm text-gray-600 mt-1.5">{why}</p>}
          </div>
        )}

        {ride && (
          <p className="text-sm text-emerald-700 mt-3 truncate">
            ✓ Today: {clean(ride.name)} · {ride.duration} min{(s?.todaysRides?.length ?? 0) > 1 ? ` (+${s!.todaysRides.length - 1})` : ''}
          </p>
        )}

        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setShowDetail((v) => !v)} className="text-sm font-semibold text-blue-600">
            {showDetail ? 'Hide details ▴' : 'Details ▾'}
          </button>
          <Link to="/chat" className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Coach
          </Link>
        </div>

        {showDetail && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <FreshnessGauge tsb={tsb} ctl={training?.ctl ?? 0} atl={training?.atl ?? 0} />
            {(w || latest) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {hrv != null && <div><span className="text-gray-500 text-xs">HRV</span><div className="font-semibold">{hrv} ms</div></div>}
                {rhr != null && <div><span className="text-gray-500 text-xs">Resting HR</span><div className="font-semibold">{rhr} bpm</div></div>}
                {sleep != null && <div><span className="text-gray-500 text-xs">Sleep</span><div className="font-semibold">{hm(sleep)}{need ? ` / ${hm(need)}` : ''}</div></div>}
                {strain != null && <div><span className="text-gray-500 text-xs">Strain</span><div className="font-semibold">{strain.toFixed(1)}</div></div>}
                {w?.recoveryCalibrating && <p className="col-span-2 text-xs text-gray-500">WHOOP is still calibrating — low confidence for now.</p>}
              </div>
            )}
            {healthData && <WellnessPills data={healthData} />}
            {(s?.keyPoints ?? []).slice(1).map((p, i) => <p key={i} className="text-sm text-gray-700">• {p}</p>)}
            {s && <p className="text-sm text-gray-600 leading-relaxed">{[s.summary, s.recommendation].filter(Boolean).join(' ')}</p>}
          </div>
        )}
      </CardContent>

      {selectedWorkout && (
        <WorkoutDetail
          workout={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          onSchedule={
            // Show schedule for suggested workouts (not already on calendar)
            !s?.todaysWorkout?.workoutId || selectedWorkout.id !== s.todaysWorkout.workoutId
              ? handleSchedule
              : undefined
          }
        />
      )}
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

const FORM_CLASS: Record<string, string> = {
  Fresh: 'border-sky-400 text-sky-600', Balanced: 'border-green-500 text-green-600', Productive: 'border-lime-500 text-lime-600',
  Overreaching: 'border-orange-500 text-orange-600', Overtraining: 'border-red-500 text-red-600', Detrained: 'border-gray-400 text-gray-500',
};
const HRV_LABEL: Record<string, string> = { normal: 'HRV normal', slightly_low: 'HRV slightly low', low: 'HRV low', high: 'HRV above baseline' };
const recoveryClass = (r: number) => (r >= 67 ? 'border-green-600 text-green-600' : r >= 34 ? 'border-yellow-500 text-yellow-500' : 'border-red-600 text-red-600');
const hm = (sec: number) => `${Math.floor(sec / 3600)}h${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}`;
const clean = (name: string) => name.replace(/^Draft - /, '');
const firstSentence = (t?: string) => (t ? (t.split(/(?<=[.!?])\s+/)[0] || t) : '');
