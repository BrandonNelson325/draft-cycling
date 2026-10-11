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
      // Recovery (WHOOP) / HRV trend for the top row — optional.
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

  // ── KISS layout: How am I? → What do I do? → Why (one line). Details on tap. ──
  const form = getStatus(tsb, training?.ctl ?? 0, training?.atl ?? 0);

  // Body signal: WHOOP recovery (today, or latest while today isn't scored), else watch HRV trend.
  const w = readiness?.wellness?.source === 'whoop' ? readiness.wellness : null;
  const latest = !w && readiness?.whoop?.connected ? readiness.whoop.latest : null;
  const recovery = w?.readinessScore ?? latest?.readinessScore ?? null;
  const recoveryStale = !w && !!latest;
  const hrvTrend = readiness?.hrvTrend && !readiness.hrvTrend.suspect ? readiness.hrvTrend : null;

  // The ONE call to show, in priority order.
  type Call = { label: string; title: string; meta?: string; workoutId?: string; tone: 'today' | 'change' | 'rest' | 'tomorrow' };
  let call: Call | null = null;
  const adjusting = !!(s && !hasRidden && s.todaysWorkout && s.adjustment && s.adjustment.kind !== 'none');
  if (s) {
    if (adjusting) {
      call = { label: 'Today · coach suggests', title: s.adjustment!.headline, tone: 'change' };
    } else if (!hasRidden && s.todaysWorkout) {
      call = { label: 'Today', title: clean(s.todaysWorkout.name), meta: `${s.todaysWorkout.duration} min · ${s.todaysWorkout.type}`, workoutId: s.todaysWorkout.workoutId, tone: 'today' };
    } else if (!hasRidden && s.isRestDay) {
      call = { label: 'Today', title: 'Rest day', tone: 'rest' };
    } else if (!hasRidden && s.suggestedWorkout) {
      call = { label: 'Today', title: clean(s.suggestedWorkout.name), meta: s.suggestedWorkout.type === 'rest' ? undefined : `${s.suggestedWorkout.duration} min · ${s.suggestedWorkout.type}`, workoutId: s.suggestedWorkout.workoutId, tone: s.suggestedWorkout.type === 'rest' ? 'rest' : 'today' };
    } else if (hasRidden && s.tomorrowsWorkout) {
      call = { label: 'Tomorrow', title: clean(s.tomorrowsWorkout.name), meta: `${s.tomorrowsWorkout.duration} min · ${s.tomorrowsWorkout.type}`, workoutId: s.tomorrowsWorkout.workoutId, tone: 'tomorrow' };
    } else if (hasRidden && s.suggestedWorkout) {
      call = { label: 'Tomorrow', title: clean(s.suggestedWorkout.name), meta: s.suggestedWorkout.type === 'rest' ? undefined : `${s.suggestedWorkout.duration} min · ${s.suggestedWorkout.type}`, workoutId: s.suggestedWorkout.workoutId, tone: s.suggestedWorkout.type === 'rest' ? 'rest' : 'tomorrow' };
    }
  }
  // Banner stays honest: fresh/balanced LEGS but a struggling BODY → say so.
  const bodyLow = (recovery != null && recovery < 34) || hrvTrend?.status === 'low';
  const bodyMid = !bodyLow && ((recovery != null && recovery < 67) || hrvTrend?.status === 'slightly_low');
  const positiveForm = ['Fresh', 'Balanced', 'Detrained'].includes(form.label);
  // The banner sticks to LOAD; the recovery panel below carries the body's
  // verdict — each thing said once, never "ideal for racing" next to "go easy".
  const bannerSubtitle = positiveForm && (bodyLow || bodyMid) ? 'Training load is low — legs are rested' : null;
  // Watch users (Apple Health / intervals.icu): their shared numbers.
  const watch = readiness?.wellness && readiness.wellness.source !== 'whoop' ? readiness.wellness : null;
  const watchStats = watch ? [
    watch.hrv != null ? `HRV ${watch.hrv}` : null,
    watch.rhr != null ? `RHR ${watch.rhr}` : null,
    watch.sleepSeconds != null ? `Sleep ${hm(watch.sleepSeconds)}` : null,
  ].filter(Boolean).join(' · ') : '';

  // Recovery panel: the numbers, then ONE line on what they mean for today's training.
  const bodyCells = ([
    ['HRV', (w?.hrv ?? latest?.hrv) != null ? `${w?.hrv ?? latest?.hrv} ms` : null],
    ['Resting HR', (w?.rhr ?? latest?.rhr) != null ? `${w?.rhr ?? latest?.rhr} bpm` : null],
    ['Sleep', (w?.sleepSeconds ?? latest?.sleepSeconds) != null
      ? `${hm((w?.sleepSeconds ?? latest?.sleepSeconds)!)}${(w?.sleepNeedSeconds ?? latest?.sleepNeedSeconds) ? ` / ${hm((w?.sleepNeedSeconds ?? latest?.sleepNeedSeconds)!)}` : ''}`
      : null],
    ['Strain', (w?.dayStrain ?? latest?.dayStrain) != null ? (w?.dayStrain ?? latest?.dayStrain)!.toFixed(1) : null],
  ] as [string, string | null][]).filter(([, v]) => v) as [string, string][];
  const hardToday = /vo2|threshold|interval|anaerobic|sprint|race|test|tempo|sweet/i.test(
    `${s?.todaysWorkout?.type ?? ''} ${s?.todaysWorkout?.name ?? ''}`
  );
  const bodyMeaning = recovery != null
    ? recovery < 34
      ? adjusting
        ? 'In the red: your body hasn\'t bounced back, which is why the coach is easing today off.'
        : 'In the red: your body hasn\'t bounced back. Keep today easy, with no hard efforts.'
      : recovery < 67
        ? hardToday
          ? 'Yellow: you can do the work today. Hit the targets but don\'t chase extra.'
          : 'Yellow: fine to train. Keep the effort controlled.'
        : hardToday
          ? 'Green: you\'re recovered. A good day to go hard.'
          : 'Green: you\'re recovered. Today\'s plan is a go.'
    : hrvTrend?.status
      ? HRV_MEANING[hrvTrend.status]
      : null;

  // The coach's "why" carries the recovery meaning (it reasons from Whoop/HRV);
  // fall back to our recovery line only if the coach gave no reason.
  const why = adjusting ? s!.adjustment!.reason : (s?.keyPoints?.[0] ?? (firstSentence(s?.recommendation) || bodyMeaning || ''));
  // One thin recovery line (tap to expand): "🟡 47% · HRV 38 · RHR 62 · Sleep 6h/8½h ›"
  const pillColor = recovery != null ? recoveryColor(recovery) : hrvTrend?.status ? HRV_COLOR[hrvTrend.status] : null;
  const pillLead = recovery != null ? `${recovery}%` : hrvTrend?.hrvPct != null ? `HRV ${hrvTrend.hrvPct > 0 ? '+' : ''}${hrvTrend.hrvPct}%` : null;
  const pillStats = recovery != null
    ? [
        (w?.hrv ?? latest?.hrv) != null ? `HRV ${w?.hrv ?? latest?.hrv}` : null,
        (w?.rhr ?? latest?.rhr) != null ? `RHR ${w?.rhr ?? latest?.rhr}` : null,
        (w?.sleepSeconds ?? latest?.sleepSeconds) != null
          ? `Sleep ${hmShort((w?.sleepSeconds ?? latest?.sleepSeconds)!)}${(w?.sleepNeedSeconds ?? latest?.sleepNeedSeconds) ? `/${hmShort((w?.sleepNeedSeconds ?? latest?.sleepNeedSeconds)!)}` : ''}`
          : null,
      ].filter(Boolean).join(' · ')
    : watch ? [watch.rhr != null ? `RHR ${watch.rhr}` : null, watch.sleepSeconds != null ? `Sleep ${hmShort(watch.sleepSeconds)}` : null].filter(Boolean).join(' · ') : '';
  const otherPoints = adjusting ? (s?.keyPoints ?? []) : (s?.keyPoints ?? []).slice(1);
  const ride = hasRidden ? s?.todaysRides?.[0] : null;

  return (
    <Card>
      {/* 1. How am I? — the load banner (subtitle honest about the body), then recovery */}
      <FreshnessGauge tsb={tsb} ctl={training?.ctl ?? 0} atl={training?.atl ?? 0} showDetails={false} subtitleOverride={bannerSubtitle} />
      {pillColor && pillLead ? (
        <TouchableOpacity onPress={() => setShowBody((v) => !v)} activeOpacity={0.7} style={styles.pill}>
          <View style={[styles.pillDot, { backgroundColor: pillColor }]} />
          <Text style={[styles.pillLead, { color: pillColor }]}>{pillLead}</Text>
          {pillStats ? <Text style={styles.pillStats} numberOfLines={1}>· {pillStats}</Text> : null}
          <Text style={styles.pillChevron}>{showBody ? '⌄' : '›'}</Text>
        </TouchableOpacity>
      ) : null}
      {showBody && (recovery != null ? (
        <View style={styles.bodyPanel}>
          <Text style={styles.whoopTag}>{recoveryStale ? 'WHOOP · YESTERDAY (TODAY NOT SCORED YET)' : 'WHOOP RECOVERY'}</Text>
          <View style={styles.bodyGrid}>
            {bodyCells.map(([k, v]) => (
              <View key={k} style={styles.bodyCell}>
                <Text style={styles.bodyCellLabel}>{k}</Text>
                <Text style={styles.bodyCellValue}>{v}</Text>
              </View>
            ))}
          </View>
          {bodyMeaning ? <Text style={[styles.bodyMeaning, { color: recoveryColor(recovery) }]}>{bodyMeaning}</Text> : null}
          {w?.recoveryCalibrating ? <Text style={styles.detailNote}>WHOOP is still calibrating — low confidence for now.</Text> : null}
        </View>
      ) : hrvTrend?.status ? (
        <View style={styles.bodyPanel}>
          <Text style={styles.whoopTag}>HRV VS YOUR BASELINE</Text>
          <Text style={styles.bodyTitle}>{HRV_LABEL[hrvTrend.status]}{hrvTrend.hrvPct != null ? ` · ${hrvTrend.hrvPct > 0 ? '+' : ''}${hrvTrend.hrvPct}%` : ''}</Text>
          {watchStats ? <Text style={styles.bodyStats}>{watchStats}</Text> : null}
          {bodyMeaning ? <Text style={[styles.bodyMeaning, { color: HRV_COLOR[hrvTrend.status] }]}>{bodyMeaning}</Text> : null}
        </View>
      ) : null)}

      {/* 2. What do I do? — ONE call, big */}
      {call && (
        <TouchableOpacity
          activeOpacity={call.workoutId ? 0.7 : 1}
          disabled={!call.workoutId}
          onPress={() => call?.workoutId && onWorkoutPress?.(call.workoutId)}
          style={styles.callBlock}
        >
          <Text style={[styles.callLabel, { color: TONE_COLORS[call.tone] }]}>{call.label}</Text>
          <Text style={styles.callTitle}>{call.title}</Text>
          {call.meta ? <Text style={styles.callMeta}>{call.meta}</Text> : null}
          {/* 3. Why — one line */}
          {why ? <Text style={styles.why}>{why}</Text> : null}
        </TouchableOpacity>
      )}

      {/* Coach suggests a change → athlete decides */}
      {adjusting && (
        <View style={styles.adjustmentButtons}>
          {s!.adjustment!.kind === 'rest' && (
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
            <Text style={styles.adjustmentDismissText}>Keep {clean(s!.todaysWorkout!.name)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Done today — one line */}
      {ride && (
        <Text style={styles.doneLine} numberOfLines={1}>
          ✓ {clean(ride.name)} · {ride.duration} min{(s?.todaysRides?.length ?? 0) > 1 ? ` (+${s!.todaysRides.length - 1})` : ''}
        </Text>
      )}

      {/* Details (gauge, all recovery stats, full reasoning) + Coach */}
      <View style={styles.footer}>
        <TouchableOpacity onPress={() => setShowDetail((v) => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.detailsLink}>{showDetail ? 'Hide details ▴' : 'Details ▾'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.coachButton} onPress={handleChatPress} activeOpacity={0.7}>
          <Ionicons name="chatbubbles-outline" size={15} color="#fff" />
          <Text style={styles.coachButtonText}>Coach</Text>
        </TouchableOpacity>
      </View>

      {showDetail && (
        <View style={styles.details}>
          {(w || latest) && (
            <View style={styles.detailGrid}>
              {[
                ['HRV', (w?.hrv ?? latest?.hrv) != null ? `${w?.hrv ?? latest?.hrv} ms` : null],
                ['Resting HR', (w?.rhr ?? latest?.rhr) != null ? `${w?.rhr ?? latest?.rhr} bpm` : null],
                ['Sleep', (w?.sleepSeconds ?? latest?.sleepSeconds) != null ? `${hm((w?.sleepSeconds ?? latest?.sleepSeconds)!)}${(w?.sleepNeedSeconds ?? latest?.sleepNeedSeconds) ? ` / ${hm((w?.sleepNeedSeconds ?? latest?.sleepNeedSeconds)!)}` : ''}` : null],
                ['Strain', (w?.dayStrain ?? latest?.dayStrain) != null ? (w?.dayStrain ?? latest?.dayStrain)!.toFixed(1) : null],
              ].filter(([, v]) => v).map(([k, v]) => (
                <View key={k as string} style={styles.detailCell}>
                  <Text style={styles.detailLabel}>{k}</Text>
                  <Text style={styles.detailValueSm}>{v}</Text>
                </View>
              ))}
              {w?.recoveryCalibrating ? <Text style={styles.detailNote}>WHOOP is still calibrating — low confidence for now.</Text> : null}
            </View>
          )}
          {otherPoints.map((p, i) => (
            <Text key={i} style={styles.detailPoint}>• {p}</Text>
          ))}
          {s ? <Text style={styles.recommendation}>{[s.summary, s.recommendation].filter(Boolean).join(' ')}</Text> : null}
          {adjusting && s?.todaysWorkout ? (
            <Text style={styles.recommendation}>Originally planned: {clean(s.todaysWorkout.name)} · {s.todaysWorkout.duration} min</Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}

const TONE_COLORS = { today: '#60a5fa', change: '#fbbf24', rest: '#22c55e', tomorrow: '#a78bfa' } as const;
const HRV_MEANING: Record<string, string> = {
  low: 'Your body is under stress. Go easier than planned today.',
  slightly_low: 'A little run down. Fine to train, keep the intensity controlled.',
  normal: 'Right on your baseline. Train as planned.',
  high: 'Well recovered. A good day for the hard work.',
};
const HRV_COLOR: Record<string, string> = { low: '#ef4444', slightly_low: '#eab308', normal: '#22c55e', high: '#22c55e' };
const HRV_LABEL: Record<string, string> = { normal: 'HRV normal', slightly_low: 'HRV slightly low', low: 'HRV low', high: 'HRV above baseline' };
const recoveryColor = (r: number) => (r >= 67 ? '#22c55e' : r >= 34 ? '#eab308' : '#ef4444');
/** 6h, 8½h — compact for the pill. */
const hmShort = (sec: number) => {
  const h = sec / 3600;
  const whole = Math.floor(h);
  const frac = h - whole;
  return frac >= 0.375 && frac < 0.625 ? `${whole}½h` : `${Math.round(h)}h`;
};
const hm = (sec: number) => `${Math.floor(sec / 3600)}h${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}`;
const clean = (name: string) => name.replace(/^Draft - /, '');
const firstSentence = (t?: string) => (t ? (t.split(/(?<=[.!?])\s+/)[0] || t) : '');

const styles = StyleSheet.create({
  bodyPanel: { marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: '#0f172a', gap: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#0f172a' },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillLead: { fontSize: 14, fontWeight: '800' },
  pillStats: { color: '#94a3b8', fontSize: 13, flex: 1 },
  pillChevron: { color: '#64748b', fontSize: 16, fontWeight: '700' },
  bodyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bodyGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4, rowGap: 4 },
  bodyCell: { width: '50%' },
  bodyCellLabel: { color: '#64748b', fontSize: 11 },
  bodyCellValue: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  bodyMeaning: { fontSize: 13, fontWeight: '600', marginTop: 8, lineHeight: 18 },
  whoopTag: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  ring: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontSize: 17, fontWeight: '800' },
  bodyTitle: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  bodyStats: { color: '#94a3b8', fontSize: 12, marginTop: 1 },
  formChip: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' },
  formLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  formValue: { fontSize: 14, fontWeight: '800' },
  callBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  callLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  callTitle: { color: '#f8fafc', fontSize: 19, fontWeight: '700', marginTop: 3 },
  callMeta: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  why: { color: '#cbd5e1', fontSize: 13, lineHeight: 18, marginTop: 6 },
  doneLine: { color: '#64748b', fontSize: 12, marginTop: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  detailsLink: { color: '#60a5fa', fontSize: 13, fontWeight: '600' },
  coachButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#3b82f6', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  coachButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  details: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155', gap: 8 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  detailCell: { width: '50%' },
  detailValueSm: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', marginTop: 1 },
  detailNote: { color: '#94a3b8', fontSize: 12, width: '100%', marginTop: 2 },
  detailPoint: { color: '#cbd5e1', fontSize: 13, lineHeight: 18 },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  aiSection: {
    marginTop: 16,
    gap: 10,
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
