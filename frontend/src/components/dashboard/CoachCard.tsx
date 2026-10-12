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
  const [showBody, setShowBody] = useState(false);
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

  // ── Recovery: ONE line under the banner (WHOOP recovery, else watch HRV trend) ──
  const w = readiness?.wellness?.source === 'whoop' ? readiness.wellness : null;
  const latest = !w && readiness?.whoop?.connected ? readiness.whoop.latest : null;
  const recovery = w?.readinessScore ?? latest?.readinessScore ?? null;
  const hrvTrend = readiness?.hrvTrend && !readiness.hrvTrend.suspect ? readiness.hrvTrend : null;
  const watch = readiness?.wellness && readiness.wellness.source !== 'whoop' ? readiness.wellness : null;
  const hrv = w?.hrv ?? latest?.hrv ?? null, rhr = w?.rhr ?? latest?.rhr ?? null, sleep = w?.sleepSeconds ?? latest?.sleepSeconds ?? null;
  const need = w?.sleepNeedSeconds ?? latest?.sleepNeedSeconds ?? null, strain = w?.dayStrain ?? latest?.dayStrain ?? null;
  const band = recovery != null ? (recovery >= 67 ? 'green' : recovery >= 34 ? 'yellow' : 'red')
    : hrvTrend?.status ? ({ low: 'red', slightly_low: 'yellow', normal: 'green', high: 'green' } as Record<string, string>)[hrvTrend.status] : null;
  const pillDot = band === 'green' ? 'bg-green-500' : band === 'yellow' ? 'bg-yellow-500' : 'bg-red-500';
  const pillText = band === 'green' ? 'text-green-600' : band === 'yellow' ? 'text-yellow-600' : 'text-red-600';
  const pillLead = recovery != null ? `${recovery}%` : hrvTrend?.hrvPct != null ? `HRV ${hrvTrend.hrvPct > 0 ? '+' : ''}${hrvTrend.hrvPct}%` : null;
  const pillStats = recovery != null
    ? [hrv != null ? `HRV ${hrv}` : null, rhr != null ? `RHR ${rhr}` : null, sleep != null ? `Sleep ${hmShort(sleep)}${need ? `/${hmShort(need)}` : ''}` : null].filter(Boolean).join(' · ')
    : watch ? [watch.rhr != null ? `RHR ${watch.rhr}` : null, watch.sleepSeconds != null ? `Sleep ${hmShort(watch.sleepSeconds)}` : null].filter(Boolean).join(' · ') : '';
  // Banner never says "ideal for racing" when the body says otherwise.
  const form = getStatus(tsb, training?.ctl ?? 0, training?.atl ?? 0);
  const bannerSubtitle = band && band !== 'green' && ['Fresh', 'Balanced', 'Detrained'].includes(form.label) ? 'Training load is low — legs are rested' : null;
  const bodyMeaning = band === 'green' ? "Green: you're recovered — a good day for intensity."
    : band === 'yellow' ? 'Yellow: fine to train — keep the effort controlled.'
    : band === 'red' ? "Red: your body hasn't bounced back — keep it easy." : null;
  // Tile sentence: what it means for training today (the colour carries green/yellow/red).
  const tileMeaning = bodyMeaning ? bodyMeaning.split(': ').slice(1).join(': ') : null;
  const tileTitle = recovery != null ? (latest ? 'Recovery · yesterday' : 'Recovery') : 'HRV vs your baseline';

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        {/* Freshness Gauge — the visual hook */}
        <FreshnessGauge tsb={tsb} ctl={training?.ctl ?? 0} atl={training?.atl ?? 0} subtitleOverride={bannerSubtitle} />

        {/* Recovery tile — number, what it means for today, the stats; click for the full numbers */}
        {pillLead && (
          <button onClick={() => setShowBody((x) => !x)} className="w-full rounded-xl bg-gray-50 border px-3.5 py-2.5 text-left hover:bg-gray-100 space-y-1">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${pillDot}`} />
              <span className={`text-xl font-extrabold ${pillText}`}>{pillLead}</span>
              <span className="text-sm font-semibold text-gray-500 flex-1">{tileTitle}</span>
              <span className="text-gray-400 text-sm">{showBody ? '⌄' : '›'}</span>
            </div>
            {tileMeaning && <p className="text-sm font-medium text-gray-800">{tileMeaning}</p>}
            {pillStats && <p className="text-[13px] text-gray-500 truncate">{pillStats}</p>}
          </button>
        )}
        {showBody && pillLead && (
          <div className="rounded-xl border bg-gray-50 p-3 space-y-2">
            <div className="text-[9px] font-bold tracking-widest text-gray-400">
              {recovery != null ? (latest ? 'WHOOP · YESTERDAY (TODAY NOT SCORED YET)' : 'WHOOP RECOVERY') : 'HRV VS YOUR BASELINE'}
            </div>
            {recovery != null ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {hrv != null && <div><span className="text-gray-500 text-xs">HRV</span><div className="font-semibold">{hrv} ms</div></div>}
                {rhr != null && <div><span className="text-gray-500 text-xs">Resting HR</span><div className="font-semibold">{rhr} bpm</div></div>}
                {sleep != null && <div><span className="text-gray-500 text-xs">Sleep</span><div className="font-semibold">{hm(sleep)}{need ? ` / ${hm(need)}` : ''}</div></div>}
                {strain != null && <div><span className="text-gray-500 text-xs">Strain</span><div className="font-semibold">{strain.toFixed(1)}</div></div>}
              </div>
            ) : watch ? (
              <p className="text-sm font-semibold">{[watch.hrv != null ? `HRV ${watch.hrv} ms` : null, watch.rhr != null ? `RHR ${watch.rhr}` : null, watch.sleepSeconds != null ? `Sleep ${hm(watch.sleepSeconds)}` : null].filter(Boolean).join(' · ')}</p>
            ) : null}
            {w?.recoveryCalibrating && <p className="text-xs text-gray-500">WHOOP is still calibrating — low confidence for now.</p>}
          </div>
        )}

        {/* AI summary */}
        {s && (
          <div className="space-y-5">
            {/* Day boxes — one compact row each */}
            <div className="space-y-2">
            {hasRidden && s.todaysRides.map((ride, i) => (
              <WorkoutRow key={i} tone="done" label={i === 0 ? 'Done today' : ''} name={ride.name} meta={`${ride.duration}min · ${ride.tss} TSS`} />
            ))}
            {!hasRidden && s.todaysWorkout && (
              <WorkoutRow tone="plan" label="Today" name={s.todaysWorkout.name}
                meta={`${s.todaysWorkout.duration}min · ${s.todaysWorkout.tss} TSS`}
                onClick={s.todaysWorkout.workoutId ? () => handleWorkoutClick(s.todaysWorkout?.workoutId) : undefined} />
            )}
            {!hasRidden && s.isRestDay && <WorkoutRow tone="rest" label="Today" name="Rest day" meta="Recovery is part of the plan" />}
            {!hasRidden && !s.isRestDay && s.suggestedWorkout && !s.todaysWorkout && (
              <WorkoutRow tone={s.suggestedWorkout.type === 'rest' ? 'rest' : 'suggest'} label={s.suggestedWorkout.type === 'rest' ? 'Today' : 'Suggested'}
                name={s.suggestedWorkout.name}
                meta={s.suggestedWorkout.type !== 'rest' ? `${s.suggestedWorkout.duration}min · ${s.suggestedWorkout.type}` : undefined}
                onClick={s.suggestedWorkout.workoutId ? () => handleWorkoutClick(s.suggestedWorkout?.workoutId) : undefined} />
            )}
            {(hasRidden || s.isRestDay) && s.tomorrowsWorkout && (
              <WorkoutRow tone="plan" label="Tomorrow" name={s.tomorrowsWorkout.name}
                meta={`${s.tomorrowsWorkout.duration}min · ${s.tomorrowsWorkout.tss} TSS`}
                onClick={s.tomorrowsWorkout.workoutId ? () => handleWorkoutClick(s.tomorrowsWorkout?.workoutId) : undefined} />
            )}
            {hasRidden && !s.tomorrowsWorkout && s.suggestedWorkout && (
              <WorkoutRow tone={s.suggestedWorkout.type === 'rest' ? 'rest' : 'suggest'} label="Tomorrow"
                name={s.suggestedWorkout.type === 'rest' ? 'Rest day' : s.suggestedWorkout.name}
                meta={s.suggestedWorkout.type !== 'rest' ? `${s.suggestedWorkout.duration}min · suggested` : undefined}
                onClick={s.suggestedWorkout.workoutId ? () => handleWorkoutClick(s.suggestedWorkout?.workoutId) : undefined} />
            )}
            </div>

            {/* The why — key points (glanceable); full reasoning sits behind "See more". */}
            {(s.keyPoints?.length ?? 0) > 0 ? (
              <div>
                <ul className="space-y-2">
                  {s.keyPoints!.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-snug font-medium text-gray-700">
                      <span className="text-blue-500">•</span><span>{p}</span>
                    </li>
                  ))}
                </ul>
                <button onClick={() => setShowDetail((v) => !v)} className="text-xs font-semibold text-blue-600 mt-1">
                  {showDetail ? 'Hide detail ▴' : 'See more detail ▾'}
                </button>
                {showDetail && (
                  <p className="text-sm text-gray-600 leading-relaxed mt-1">{[s.summary, s.recommendation].filter(Boolean).join(' ')}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-700 leading-relaxed">{s.summary}</p>
            )}

            {/* Recommendation (only when there are no key points — otherwise it's in "See more") */}
            {!(s.keyPoints?.length) && <p className="text-sm text-gray-500">{s.recommendation}</p>}
          </div>
        )}

        {/* Wellness pills */}
        {healthData && <WellnessPills data={healthData} skipBasics={!!pillLead} />}

        {/* Fitness & fatigue now live in the always-visible FitnessTrendChart
            on the dashboard (not hidden behind a toggle here). */}

        {/* Chat link */}
        <Link
          to="/chat"
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Chat with Coach
        </Link>
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

const ROW_TONES = {
  done: { box: 'border-emerald-200 bg-emerald-50', label: 'text-emerald-700' },
  plan: { box: 'border-blue-200 bg-blue-50', label: 'text-blue-700' },
  suggest: { box: 'border-purple-200 bg-purple-50', label: 'text-purple-700' },
  rest: { box: 'border-green-200 bg-green-50', label: 'text-green-700' },
} as const;

// Every planned workout is prefixed "Draft - " — noise on the card (calendar/exports keep it).
const cleanName = (n: string) => n.replace(/^Draft\s*[-–—:]\s*/i, '');

function WorkoutRow({ tone, label, name, meta, onClick }: { tone: keyof typeof ROW_TONES; label: string; name: string; meta?: string; onClick?: () => void }) {
  const t = ROW_TONES[tone];
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border px-3 py-2.5 ${t.box} ${onClick ? 'cursor-pointer hover:shadow-sm transition-shadow' : ''}`}
    >
      <div className="truncate text-[11px]">
        <span className={`font-semibold uppercase tracking-wide ${t.label}`}>{label}</span>
        {meta && <span className="text-gray-500">{label ? '  ·  ' : ''}{meta}</span>}
      </div>
      <div className="text-[15px] font-semibold text-gray-800 line-clamp-2">{cleanName(name)}</div>
    </div>
  );
}

// skipBasics: the recovery line above already shows sleep / HRV / RHR / recovery,
// so only the extras (Body Battery, Stress) stay here.
function WellnessPills({ data, skipBasics }: { data: HealthData; skipBasics?: boolean }) {
  const pills: { icon: React.ReactNode; value: string; label: string; bg: string }[] = [];

  if (!skipBasics && data.sleep_hours) {
    pills.push({
      icon: <Moon className="w-3.5 h-3.5 text-blue-600" />,
      value: `${data.sleep_hours}h`,
      label: 'Sleep',
      bg: 'bg-blue-50',
    });
  }
  if (!skipBasics && data.hrv) {
    pills.push({
      icon: <Activity className="w-3.5 h-3.5 text-green-600" />,
      value: `${data.hrv}ms`,
      label: 'HRV',
      bg: 'bg-green-50',
    });
  }
  if (!skipBasics && data.resting_heart_rate) {
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
  if (!skipBasics && data.readiness_score != null) {
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

const hm = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
/** 6h, 8½h — compact for the pill. */
const hmShort = (sec: number) => {
  const h = sec / 3600; const whole = Math.floor(h); const frac = h - whole;
  return frac >= 0.375 && frac < 0.625 ? `${whole}½h` : `${Math.round(h)}h`;
};
