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
  const [showBody, setShowBody] = useState(false);
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
  // Banner stays honest: fresh/balanced LEGS but a struggling BODY → say so.
  const bodyLow = (recovery != null && recovery < 34) || hrvTrend?.status === 'low';
  const bodyMid = !bodyLow && ((recovery != null && recovery < 67) || hrvTrend?.status === 'slightly_low');
  const positiveForm = ['Fresh', 'Balanced', 'Detrained'].includes(form.label);
  // The banner sticks to LOAD; the recovery block carries the body's verdict.
  const bannerSubtitle = positiveForm && (bodyLow || bodyMid) ? 'Training load is low — legs are rested' : null;
  const hardToday = /vo2|threshold|interval|anaerobic|sprint|race|test|tempo|sweet/i.test(`${s?.todaysWorkout?.type ?? ''} ${s?.todaysWorkout?.name ?? ''}`);
  const bodyMeaning = recovery != null
    ? recovery < 34
      ? "In the red: your body hasn't bounced back. Keep today easy, with no hard efforts."
      : recovery < 67
        ? (hardToday ? "Yellow: you can do the work today. Hit the targets but don't chase extra." : 'Yellow: fine to train. Keep the effort controlled.')
        : (hardToday ? "Green: you're recovered. A good day to go hard." : "Green: you're recovered. Today's plan is a go.")
    : hrvTrend?.status ? HRV_MEANING[hrvTrend.status] : null;
  const watch = readiness?.wellness && readiness.wellness.source !== 'whoop' ? readiness.wellness : null;
  const watchStats = watch ? [watch.hrv != null ? `HRV ${watch.hrv}` : null, watch.rhr != null ? `RHR ${watch.rhr}` : null, watch.sleepSeconds != null ? `Sleep ${hm(watch.sleepSeconds)}` : null].filter(Boolean).join(' · ') : '';

  // The coach's "why" carries the recovery meaning; our line is only a fallback.
  const why = s?.keyPoints?.[0] ?? (firstSentence(s?.recommendation) || bodyMeaning || '');
  const pillTone = recovery != null ? recoveryText(recovery) : hrvTrend?.status ? HRV_TEXT[hrvTrend.status] : '';
  const pillDot = recovery != null ? (recovery >= 67 ? 'bg-green-500' : recovery >= 34 ? 'bg-yellow-500' : 'bg-red-500')
    : hrvTrend?.status ? ({ low: 'bg-red-500', slightly_low: 'bg-yellow-500', normal: 'bg-green-500', high: 'bg-green-500' } as Record<string, string>)[hrvTrend.status] : '';
  const pillLead = recovery != null ? `${recovery}%` : hrvTrend?.hrvPct != null ? `HRV ${hrvTrend.hrvPct > 0 ? '+' : ''}${hrvTrend.hrvPct}%` : null;
  const pillStats = recovery != null
    ? [hrv != null ? `HRV ${hrv}` : null, rhr != null ? `RHR ${rhr}` : null, sleep != null ? `Sleep ${hmShort(sleep)}${need ? `/${hmShort(need)}` : ''}` : null].filter(Boolean).join(' · ')
    : watch ? [watch.rhr != null ? `RHR ${watch.rhr}` : null, watch.sleepSeconds != null ? `Sleep ${hmShort(watch.sleepSeconds)}` : null].filter(Boolean).join(' · ') : '';
  const ride = hasRidden ? s?.todaysRides?.[0] : null;

  return (
    <Card>
      <CardContent className="p-5">
        {/* 1. How am I? — the load banner (subtitle honest about the body), then recovery */}
        <FreshnessGauge tsb={tsb} ctl={training?.ctl ?? 0} atl={training?.atl ?? 0} subtitleOverride={bannerSubtitle} />
        {pillLead && (
          <button onClick={() => setShowBody((v) => !v)} className="mt-3 w-full flex items-center gap-2 rounded-full bg-gray-50 border px-3 py-1.5 text-left hover:bg-gray-100">
            <span className={`w-2 h-2 rounded-full ${pillDot}`} />
            <span className={`text-sm font-extrabold ${pillTone}`}>{pillLead}</span>
            {pillStats && <span className="text-sm text-gray-500 truncate flex-1">· {pillStats}</span>}
            <span className="text-gray-400 text-sm">{showBody ? '⌄' : '›'}</span>
          </button>
        )}
        {showBody && (recovery != null ? (
          <div className="mt-2 rounded-xl border bg-gray-50 p-3 space-y-2">
            <div className="text-[9px] font-bold tracking-widest text-gray-400">{latest ? 'WHOOP · YESTERDAY (TODAY NOT SCORED YET)' : 'WHOOP RECOVERY'}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {hrv != null && <div><span className="text-gray-500 text-xs">HRV</span><div className="font-semibold">{hrv} ms</div></div>}
              {rhr != null && <div><span className="text-gray-500 text-xs">Resting HR</span><div className="font-semibold">{rhr} bpm</div></div>}
              {sleep != null && <div><span className="text-gray-500 text-xs">Sleep</span><div className="font-semibold">{hm(sleep)}{need ? ` / ${hm(need)}` : ''}</div></div>}
              {strain != null && <div><span className="text-gray-500 text-xs">Strain</span><div className="font-semibold">{strain.toFixed(1)}</div></div>}
            </div>
            {bodyMeaning && <p className={`text-sm font-medium ${recoveryText(recovery)}`}>{bodyMeaning}</p>}
            {w?.recoveryCalibrating && <p className="text-xs text-gray-500">WHOOP is still calibrating — low confidence for now.</p>}
          </div>
        ) : hrvTrend?.status ? (
          <div className="mt-2 rounded-xl border bg-gray-50 p-3 space-y-1">
            <div className="text-[9px] font-bold tracking-widest text-gray-400">HRV VS YOUR BASELINE</div>
            <p className="text-sm font-semibold text-gray-900">{HRV_LABEL[hrvTrend.status]}{hrvTrend.hrvPct != null ? ` · ${hrvTrend.hrvPct > 0 ? '+' : ''}${hrvTrend.hrvPct}%` : ''}</p>
            {watchStats && <p className="text-xs text-gray-500">{watchStats}</p>}
            {bodyMeaning && <p className={`text-sm font-medium ${HRV_TEXT[hrvTrend.status]}`}>{bodyMeaning}</p>}
          </div>
        ) : null)}

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
          <p className="text-xs text-gray-400 mt-2 truncate">
            ✓ {clean(ride.name)} · {ride.duration} min{(s?.todaysRides?.length ?? 0) > 1 ? ` (+${s!.todaysRides.length - 1})` : ''}
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

const HRV_LABEL: Record<string, string> = { normal: 'HRV normal', slightly_low: 'HRV slightly low', low: 'HRV low', high: 'HRV above baseline' };
const HRV_MEANING: Record<string, string> = {
  low: 'Your body is under stress. Go easier than planned today.',
  slightly_low: 'A little run down. Fine to train, keep the intensity controlled.',
  normal: 'Right on your baseline. Train as planned.',
  high: 'Well recovered. A good day for the hard work.',
};
const HRV_TEXT: Record<string, string> = { low: 'text-red-600', slightly_low: 'text-yellow-600', normal: 'text-green-600', high: 'text-green-600' };
const recoveryText = (r: number) => (r >= 67 ? 'text-green-600' : r >= 34 ? 'text-yellow-600' : 'text-red-600');
const recoveryClass = (r: number) => (r >= 67 ? 'border-green-600 text-green-600' : r >= 34 ? 'border-yellow-500 text-yellow-500' : 'border-red-600 text-red-600');
const hm = (sec: number) => `${Math.floor(sec / 3600)}h${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}`;
/** 6h, 8½h — compact for the pill. */
const hmShort = (sec: number) => {
  const h = sec / 3600; const whole = Math.floor(h); const frac = h - whole;
  return frac >= 0.375 && frac < 0.625 ? `${whole}½h` : `${Math.round(h)}h`;
};
const clean = (name: string) => name.replace(/^Draft - /, '');
const firstSentence = (t?: string) => (t ? (t.split(/(?<=[.!?])\s+/)[0] || t) : '');
