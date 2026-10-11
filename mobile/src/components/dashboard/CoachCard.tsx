import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import Card from '../ui/Card';
import FreshnessGauge, { getStatus } from './FreshnessGauge';
import { dailyAnalysisService } from '../../services/dailyAnalysisService';
import type { TodaySuggestion } from '../../services/dailyAnalysisService';
import { trainingService } from '../../services/trainingService';
import { dailyCheckInService, type DailyReadiness } from '../../services/dailyCheckInService';
import type { MainTabParamList } from '../../navigation/types';

interface TrainingStatus {
  ctl: number;
  atl: number;
  tsb: number;
  form_status: string;
}

interface CoachCardProps {
  onWorkoutPress?: (workoutId: string) => void;
}

export default function CoachCard({ onWorkoutPress }: CoachCardProps = {}) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [suggestion, setSuggestion] = useState<TodaySuggestion | null>(null);
  const [training, setTraining] = useState<TrainingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [adjustmentBusy, setAdjustmentBusy] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const [readiness, setReadiness] = useState<DailyReadiness | null>(null);

  useEffect(() => {
    let failed = 0;
    Promise.all([
      dailyAnalysisService.getTodaySuggestion().catch(() => { failed++; return null; }),
      trainingService.getTrainingStatus().catch(() => { failed++; return null; }),
      // Recovery (WHOOP) / watch HRV for the one-line pill — optional.
      dailyCheckInService.getDailyReadiness().catch(() => null),
    ]).then(([s, t, r]) => {
      if (failed === 2) setError(true);
      setSuggestion(s);
      setTraining(t ?? null);
      setReadiness(r);
      setLoading(false);
    });
  }, []);

  const handleAcceptAdjustment = async () => {
    if (!suggestion?.suggestion?.adjustment || adjustmentBusy) return;
    setAdjustmentBusy(true);
    try {
      await dailyAnalysisService.acceptAdjustment(
        suggestion.suggestion.adjustment.kind as 'rest' | 'easier',
        suggestion.suggestion.adjustment.reason
      );
      const fresh = await dailyAnalysisService.getTodaySuggestion();
      setSuggestion(fresh);
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
      setSuggestion(fresh);
    } catch (err) {
      console.error('Failed to dismiss adjustment:', err);
    } finally {
      setAdjustmentBusy(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 24 }} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Text style={styles.title}>Training Status</Text>
        <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>
          Unable to load training data. Pull down to refresh.
        </Text>
      </Card>
    );
  }

  const tsb = training?.tsb ?? suggestion?.suggestion?.currentTSB ?? 0;
  const s = suggestion?.suggestion;
  const hasRidden = suggestion?.hasRiddenToday ?? false;

  const handleChatPress = () => {
    // Keep the seed message short and conversational — the AI already has full
    // context (TSB, readiness, today's rides, planned workout) via
    // buildAthleteContext on the backend, so repeating those stats here is
    // redundant and reads as canned.
    let msg: string;
    if (hasRidden && s?.todaysRides && s.todaysRides.length > 0) {
      msg = "Let's chat about today's ride.";
    } else if (s?.todaysWorkout) {
      msg = "Let's chat about today's workout.";
    } else {
      msg = "Let's chat about today.";
    }
    navigation.navigate('Chat', { initialMessage: msg });
  };

  // ── Recovery: ONE line under the banner (WHOOP recovery, else watch HRV trend) ──
  const w = readiness?.wellness?.source === 'whoop' ? readiness.wellness : null;
  const latest = !w && readiness?.whoop?.connected ? readiness.whoop.latest : null;
  const recovery = w?.readinessScore ?? latest?.readinessScore ?? null;
  const hrvTrend = readiness?.hrvTrend && !readiness.hrvTrend.suspect ? readiness.hrvTrend : null;
  const watch = readiness?.wellness && readiness.wellness.source !== 'whoop' ? readiness.wellness : null;
  const v = <T,>(a: T | null | undefined, b: T | null | undefined) => (a ?? b ?? null);
  const hrv = v(w?.hrv, latest?.hrv), rhr = v(w?.rhr, latest?.rhr), sleep = v(w?.sleepSeconds, latest?.sleepSeconds);
  const need = v(w?.sleepNeedSeconds, latest?.sleepNeedSeconds), strain = v(w?.dayStrain, latest?.dayStrain);
  const pillColor = recovery != null ? recoveryColor(recovery) : hrvTrend?.status ? HRV_COLOR[hrvTrend.status] : null;
  const pillLead = recovery != null ? `${recovery}%` : hrvTrend?.hrvPct != null ? `HRV ${hrvTrend.hrvPct > 0 ? '+' : ''}${hrvTrend.hrvPct}%` : null;
  const pillStats = recovery != null
    ? [hrv != null ? `HRV ${hrv}` : null, rhr != null ? `RHR ${rhr}` : null, sleep != null ? `Sleep ${hmShort(sleep)}${need ? `/${hmShort(need)}` : ''}` : null].filter(Boolean).join(' · ')
    : watch ? [watch.rhr != null ? `RHR ${watch.rhr}` : null, watch.sleepSeconds != null ? `Sleep ${hmShort(watch.sleepSeconds)}` : null].filter(Boolean).join(' · ') : '';
  // Banner never says "ideal for racing" when the body says otherwise.
  const form = getStatus(tsb, training?.ctl ?? 0, training?.atl ?? 0);
  const bodyLow = (recovery != null && recovery < 67) || hrvTrend?.status === 'low' || hrvTrend?.status === 'slightly_low';
  const bannerSubtitle = bodyLow && ['Fresh', 'Balanced', 'Detrained'].includes(form.label) ? 'Training load is low — legs are rested' : null;
  const bodyMeaning = recovery != null
    ? (recovery >= 67 ? "Green: you're recovered — a good day for intensity." : recovery >= 34 ? 'Yellow: fine to train — keep the effort controlled.' : "Red: your body hasn't bounced back — keep it easy.")
    : hrvTrend?.status ? HRV_MEANING[hrvTrend.status] : null;

  return (
    <Card>
      <Text style={styles.title}>Training Status</Text>

      {/* Freshness Gauge — compact, no CTL/ATL details */}
      <FreshnessGauge tsb={tsb} ctl={training?.ctl ?? 0} atl={training?.atl ?? 0} showDetails={false} subtitleOverride={bannerSubtitle} />

      {/* Recovery — one line; tap for the full numbers */}
      {pillColor && pillLead ? (
        <TouchableOpacity onPress={() => setShowBody((x) => !x)} activeOpacity={0.7} style={styles.pill}>
          <View style={[styles.pillDot, { backgroundColor: pillColor }]} />
          <Text style={[styles.pillLead, { color: pillColor }]}>{pillLead}</Text>
          {pillStats ? <Text style={styles.pillStats} numberOfLines={1}>· {pillStats}</Text> : null}
          <Text style={styles.pillChevron}>{showBody ? '⌄' : '›'}</Text>
        </TouchableOpacity>
      ) : null}
      {showBody && pillColor ? (
        <View style={styles.bodyPanel}>
          <Text style={styles.bodyTag}>
            {recovery != null ? (latest ? 'WHOOP · YESTERDAY (TODAY NOT SCORED YET)' : 'WHOOP RECOVERY') : 'HRV VS YOUR BASELINE'}
          </Text>
          {recovery != null ? (
            <View style={styles.bodyGrid}>
              {([['HRV', hrv != null ? `${hrv} ms` : null], ['Resting HR', rhr != null ? `${rhr} bpm` : null],
                 ['Sleep', sleep != null ? `${hm(sleep)}${need ? ` / ${hm(need)}` : ''}` : null], ['Strain', strain != null ? strain.toFixed(1) : null]] as [string, string | null][])
                .filter(([, val]) => val).map(([k, val]) => (
                  <View key={k} style={styles.bodyCell}>
                    <Text style={styles.bodyLabel}>{k}</Text>
                    <Text style={styles.bodyValue}>{val}</Text>
                  </View>
                ))}
            </View>
          ) : watch ? (
            <Text style={styles.bodyValue}>{[watch.hrv != null ? `HRV ${watch.hrv} ms` : null, watch.rhr != null ? `RHR ${watch.rhr}` : null, watch.sleepSeconds != null ? `Sleep ${hm(watch.sleepSeconds)}` : null].filter(Boolean).join(' · ')}</Text>
          ) : null}
          {bodyMeaning ? <Text style={[styles.bodyMeaning, { color: pillColor }]}>{bodyMeaning}</Text> : null}
          {w?.recoveryCalibrating ? <Text style={styles.bodyLabel}>WHOOP is still calibrating — low confidence for now.</Text> : null}
        </View>
      ) : null}

      {/* Workout blocks + recommendation */}
      {s && (
        <View style={styles.aiSection}>
          {/* Day rows — one compact line each */}
          {hasRidden && s.todaysRides.map((ride, i) => (
            <WorkoutRow key={i} tone="done" label={i === 0 ? 'Done today' : ''} name={ride.name} meta={`${ride.duration}min · Load ${ride.tss}`} />
          ))}

          {/* Coach override (pre-ride): AI thinks the plan should change */}
          {!hasRidden && s.todaysWorkout && s.adjustment && s.adjustment.kind !== 'none' && (
            <View style={[styles.workoutBox, styles.adjustmentBox]}>
              <Text style={[styles.workoutLabel, styles.adjustmentLabel]}>Suggested</Text>
              <Text style={styles.workoutName}>{s.adjustment.headline}</Text>
              <Text style={styles.workoutMeta}>{s.adjustment.reason}</Text>
              <View style={styles.adjustmentButtons}>
                {s.adjustment.kind === 'rest' && (
                  <TouchableOpacity
                    style={[styles.adjustmentButton, styles.adjustmentAccept, adjustmentBusy && styles.adjustmentDisabled]}
                    onPress={handleAcceptAdjustment}
                    disabled={adjustmentBusy}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.adjustmentAcceptText}>Take rest day</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.adjustmentButton, styles.adjustmentDismiss, adjustmentBusy && styles.adjustmentDisabled]}
                  onPress={handleDismissAdjustment}
                  disabled={adjustmentBusy}
                  activeOpacity={0.7}
                >
                  <Text style={styles.adjustmentDismissText}>Keep planned</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!hasRidden && s.todaysWorkout && (
            <WorkoutRow
              tone="plan"
              dimmed={!!s.adjustment && s.adjustment.kind !== 'none'}
              label={s.adjustment && s.adjustment.kind !== 'none' ? 'Was planned' : 'Today'}
              name={s.todaysWorkout.name}
              meta={`${s.todaysWorkout.duration}min · Load ${s.todaysWorkout.tss}`}
              onPress={s.todaysWorkout.workoutId ? () => onWorkoutPress?.(s.todaysWorkout!.workoutId!) : undefined}
            />
          )}
          {!hasRidden && s.isRestDay && <WorkoutRow tone="rest" label="Today" name="Rest day" meta="Recovery day" />}
          {!hasRidden && !s.isRestDay && s.suggestedWorkout && !s.todaysWorkout && (
            <WorkoutRow
              tone={s.suggestedWorkout.type === 'rest' ? 'rest' : 'suggest'}
              label={s.suggestedWorkout.type === 'rest' ? 'Today' : 'Suggested'}
              name={s.suggestedWorkout.name}
              meta={s.suggestedWorkout.type !== 'rest' ? `${s.suggestedWorkout.duration}min · ${s.suggestedWorkout.type}` : undefined}
              onPress={s.suggestedWorkout.workoutId ? () => onWorkoutPress?.(s.suggestedWorkout!.workoutId!) : undefined}
            />
          )}
          {(hasRidden || s.isRestDay) && s.tomorrowsWorkout && (
            <WorkoutRow
              tone="plan"
              label="Tomorrow"
              name={s.tomorrowsWorkout.name}
              meta={`${s.tomorrowsWorkout.duration}min · Load ${s.tomorrowsWorkout.tss}`}
              onPress={s.tomorrowsWorkout.workoutId ? () => onWorkoutPress?.(s.tomorrowsWorkout!.workoutId!) : undefined}
            />
          )}
          {hasRidden && !s.tomorrowsWorkout && s.suggestedWorkout && (
            <WorkoutRow
              tone={s.suggestedWorkout.type === 'rest' ? 'rest' : 'suggest'}
              label="Tomorrow"
              name={s.suggestedWorkout.type === 'rest' ? 'Rest day' : s.suggestedWorkout.name}
              meta={s.suggestedWorkout.type !== 'rest' ? `${s.suggestedWorkout.duration}min · suggested` : undefined}
              onPress={s.suggestedWorkout.workoutId ? () => onWorkoutPress?.(s.suggestedWorkout!.workoutId!) : undefined}
            />
          )}

          {/* Key points first (glanceable); the full reasoning sits behind "See more". */}
          {(s.keyPoints?.length ?? 0) > 0 ? (
            <View style={styles.keyPoints}>
              {s.keyPoints!.map((p, i) => (
                <View key={i} style={styles.keyPointRow}>
                  <Text style={styles.keyPointDot}>•</Text>
                  <Text style={styles.keyPointText}>{p}</Text>
                </View>
              ))}
              <TouchableOpacity onPress={() => setShowDetail((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.seeMore}>{showDetail ? 'Hide detail ▴' : 'See more detail ▾'}</Text>
              </TouchableOpacity>
              {showDetail && (
                <Text style={styles.recommendation}>{[s.summary, s.recommendation].filter(Boolean).join(' ')}</Text>
              )}
            </View>
          ) : (
            <Text style={styles.recommendation}>{s.recommendation}</Text>
          )}
        </View>
      )}

      {/* Fitness & fatigue now live in the always-visible FitnessTrendChart on
          the dashboard (not hidden behind a toggle here). */}

      {/* Chat button */}
      <TouchableOpacity style={styles.chatButton} onPress={handleChatPress} activeOpacity={0.7}>
        <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
        <Text style={styles.chatButtonText}>Chat with Coach</Text>
      </TouchableOpacity>
    </Card>
  );
}

const recoveryColor = (r: number) => (r >= 67 ? '#22c55e' : r >= 34 ? '#eab308' : '#ef4444');
const HRV_COLOR: Record<string, string> = { low: '#ef4444', slightly_low: '#eab308', normal: '#22c55e', high: '#22c55e' };
const HRV_MEANING: Record<string, string> = {
  low: 'HRV low: your body is under stress — go easier than planned.',
  slightly_low: 'HRV slightly low: fine to train — keep the intensity controlled.',
  normal: 'HRV on your baseline: train as planned.',
  high: 'HRV above baseline: well recovered — a good day for the hard work.',
};
const hm = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
/** 6h, 8½h — compact for the pill. */
const hmShort = (sec: number) => {
  const h = sec / 3600; const whole = Math.floor(h); const frac = h - whole;
  return frac >= 0.375 && frac < 0.625 ? `${whole}½h` : `${Math.round(h)}h`;
};

const ROW_TONES = {
  done: { color: '#34d399', bg: '#0f172a' },
  plan: { color: '#60a5fa', bg: '#0f172a' },
  suggest: { color: '#a78bfa', bg: '#0f172a' },
  rest: { color: '#22c55e', bg: '#052e16' },
} as const;

function WorkoutRow({ tone, label, name, meta, onPress, dimmed }: {
  tone: keyof typeof ROW_TONES; label: string; name: string; meta?: string; onPress?: () => void; dimmed?: boolean;
}) {
  const t = ROW_TONES[tone];
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.7 : 1} onPress={onPress} disabled={!onPress}>
      <View style={[styles.row, { backgroundColor: t.bg, borderLeftColor: t.color }, dimmed && styles.dimmedBox]}>
        <Text style={[styles.rowLabel, { color: t.color }]}>{label}</Text>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  rowLabel: {
    width: 64,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  rowMeta: {
    fontSize: 11,
    color: '#94a3b8',
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#0f172a' },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillLead: { fontSize: 14, fontWeight: '800' },
  pillStats: { color: '#94a3b8', fontSize: 13, flex: 1 },
  pillChevron: { color: '#64748b', fontSize: 16, fontWeight: '700' },
  bodyPanel: { marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: '#0f172a', gap: 6 },
  bodyTag: { color: '#64748b', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  bodyGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  bodyCell: { width: '50%' },
  bodyLabel: { color: '#64748b', fontSize: 11 },
  bodyValue: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  bodyMeaning: { fontSize: 13, fontWeight: '600' },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  aiSection: {
    marginTop: 16,
    gap: 6,
  },
  workoutBox: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  completedBox: {
    borderLeftColor: '#34d399',
  },
  suggestedBox: {
    borderLeftColor: '#a78bfa',
  },
  tomorrowBox: {
    borderLeftColor: '#60a5fa',
  },
  restBox: {
    borderLeftColor: '#22c55e',
    backgroundColor: '#052e16',
  },
  workoutLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  completedLabel: {
    color: '#34d399',
  },
  suggestedLabel: {
    color: '#a78bfa',
  },
  tomorrowLabel: {
    color: '#60a5fa',
  },
  restLabel: {
    color: '#22c55e',
  },
  adjustmentBox: {
    borderLeftColor: '#fbbf24',
    backgroundColor: '#1f1810',
  },
  adjustmentLabel: {
    color: '#fbbf24',
  },
  adjustmentButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  adjustmentButton: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  adjustmentAccept: {
    backgroundColor: '#d97706',
  },
  adjustmentAcceptText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  adjustmentDismiss: {
    borderWidth: 1,
    borderColor: '#475569',
    backgroundColor: 'transparent',
  },
  adjustmentDismissText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  adjustmentDisabled: {
    opacity: 0.5,
  },
  dimmedBox: {
    opacity: 0.6,
  },
  rideRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  rideName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    flex: 1,
    marginRight: 8,
  },
  rideMeta: {
    fontSize: 13,
    color: '#94a3b8',
    flexShrink: 0,
  },
  workoutName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 2,
  },
  workoutMeta: {
    fontSize: 13,
    color: '#94a3b8',
  },
  recommendation: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
  },
  keyPoints: { gap: 2 },
  keyPointRow: { flexDirection: 'row', gap: 6 },
  keyPointDot: { color: '#60a5fa', fontSize: 13, lineHeight: 18 },
  keyPointText: { color: '#cbd5e1', fontSize: 13, lineHeight: 18, fontWeight: '500', flex: 1 },
  seeMore: { color: '#60a5fa', fontSize: 12, fontWeight: '600', marginTop: 4, marginBottom: 2 },
  detailsSection: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 10,
    marginTop: 12,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailsToggleText: {
    fontSize: 12,
    color: '#64748b',
  },
  detailsGrid: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 10,
  },
  detailItem: {
    flex: 1,
    borderLeftWidth: 2,
    borderLeftColor: '#334155',
    paddingLeft: 8,
  },
  detailLabel: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    marginTop: 2,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 12,
  },
  chatButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
