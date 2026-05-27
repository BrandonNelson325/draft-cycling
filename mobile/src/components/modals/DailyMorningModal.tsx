import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { dailyCheckInService, type DailyCheckInData } from '../../services/dailyCheckInService';
import type { DailyAnalysis } from '../../services/dailyAnalysisService';
import type { DailyReadiness } from '../../services/dailyCheckInService';

interface DailyMorningModalProps {
  visible: boolean;
  analysis: DailyAnalysis | null;
  readiness: DailyReadiness | null;
  onDismiss: () => void;
  onChatNavigate?: (message: string) => void;
  // Apple Health waiting flow — when these are provided AND awaitingSleepData
  // is true, the modal renders the "Waiting for sync" screen instead of the
  // normal questionnaire.
  awaitingSleepData?: boolean;
  retryCount?: number;
  maxRetries?: number;
  loading?: boolean;
  onRetrySync?: () => Promise<void> | void;
  onSkipToManual?: () => void;
}

type SleepQuality = 'terrible' | 'poor' | 'okay' | 'good' | 'great';
type Feeling = 'exhausted' | 'tired' | 'normal' | 'good' | 'energized';

const SLEEP_OPTIONS: { value: SleepQuality; emoji: string; label: string }[] = [
  { value: 'terrible', emoji: '😩', label: 'Terrible' },
  { value: 'poor', emoji: '😴', label: 'Poor' },
  { value: 'okay', emoji: '😐', label: 'Okay' },
  { value: 'good', emoji: '😊', label: 'Good' },
  { value: 'great', emoji: '🌟', label: 'Great' },
];

const FEELING_OPTIONS: { value: Feeling; emoji: string; label: string }[] = [
  { value: 'exhausted', emoji: '😩', label: 'Exhausted' },
  { value: 'tired', emoji: '😓', label: 'Tired' },
  { value: 'normal', emoji: '🙂', label: 'Normal' },
  { value: 'good', emoji: '😄', label: 'Good' },
  { value: 'energized', emoji: '⚡', label: 'Energized' },
];

const RECOMMENDATION_COLORS: Record<string, string> = {
  rest: '#ef4444',
  light: '#f97316',
  proceed: '#22c55e',
  push: '#3b82f6',
};

export default function DailyMorningModal({
  visible,
  analysis,
  readiness,
  onDismiss,
  onChatNavigate,
  awaitingSleepData,
  retryCount,
  maxRetries,
  loading: parentLoading,
  onRetrySync,
  onSkipToManual,
}: DailyMorningModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [sleepQuality, setSleepQuality] = useState<SleepQuality | null>(null);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const reset = () => {
    setStep(1);
    setSleepQuality(null);
    setFeeling(null);
    setNotes('');
  };

  const wellness = readiness?.wellness ?? null;

  const handleSubmitCheckIn = async () => {
    if (!feeling) {
      Alert.alert('Please choose how you feel.');
      return;
    }
    // The sleep picker is shown unless wellness data has actual sleep_seconds.
    // So sleepQuality is required whenever the picker is shown.
    const sleepPickerVisible = !wellness || wellness.sleepSeconds == null;
    if (sleepPickerVisible && !sleepQuality) {
      Alert.alert('Please answer both questions.');
      return;
    }

    setSaving(true);
    try {
      const checkInData: DailyCheckInData = {
        // Send sleepQuality whenever the picker was shown.
        sleepQuality: sleepPickerVisible ? sleepQuality! : undefined,
        feeling,
        notes: notes.trim() || undefined,
      };
      await dailyCheckInService.saveDailyCheckIn(checkInData);
      setStep(2);
    } catch {
      Alert.alert('Error', 'Failed to save check-in.');
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  const handleChatAboutPlan = () => {
    const msg = analysis?.todaysWorkout
      ? `I just completed my morning check-in. I'm feeling ${feeling} and slept ${sleepQuality}. My workout today is ${analysis.todaysWorkout.name}. Any advice?`
      : `I just completed my morning check-in. I'm feeling ${feeling} and slept ${sleepQuality}. What should I focus on today?`;
    handleDismiss();
    onChatNavigate?.(msg);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleDismiss}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.title}>
            {step === 1 ? 'Good Morning! 🌅' : 'Your Day Ahead'}
          </Text>
          <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="always"
        >
          {step === 1 && awaitingSleepData ? (
            <>
              {/* Waiting-for-sync screen — the user has opted into Apple Health
                  as the wellness source but sleep data hasn't arrived yet. */}
              <View style={styles.waitCard}>
                <Text style={styles.waitTitle}>🌙 Waiting for sleep data</Text>
                <Text style={styles.waitBody}>
                  Your sleep data hasn't synced from Apple Health yet. Open Garmin Connect
                  (or your device's app) and tap Sync, then come back here and tap Try Again.
                </Text>
                {!!retryCount && (
                  <Text style={styles.waitMeta}>
                    {retryCount >= (maxRetries ?? 2)
                      ? 'Still no data after several attempts — you can keep trying, or skip and answer manually.'
                      : `Retry ${retryCount} of ${maxRetries ?? 2}.`}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[styles.btn, parentLoading && styles.btnDisabled]}
                onPress={() => onRetrySync?.()}
                disabled={parentLoading}
              >
                {parentLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Try Again</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => onSkipToManual?.()}
                disabled={parentLoading}
              >
                <Text style={styles.skipBtnText}>Skip — answer manually</Text>
              </TouchableOpacity>
            </>
          ) : step === 1 ? (
            <>
              {/* Wellness data (intervals.icu) — shown instead of sleep picker */}
              {wellness && (
                <View style={styles.wellnessCard}>
                  <Text style={styles.wellnessTitle}>🌙 Sleep & Recovery</Text>
                  <View style={styles.wellnessGrid}>
                    {wellness.sleepSeconds != null && (
                      <View style={styles.wellnessStat}>
                        <Text style={styles.wellnessLabel}>Sleep</Text>
                        <Text style={styles.wellnessValue}>
                          {Math.floor(wellness.sleepSeconds / 3600)}h {Math.round((wellness.sleepSeconds % 3600) / 60)}m
                        </Text>
                      </View>
                    )}
                    {wellness.sleepScore != null && (
                      <View style={styles.wellnessStat}>
                        <Text style={styles.wellnessLabel}>Sleep Score</Text>
                        <Text style={styles.wellnessValue}>{wellness.sleepScore}/100</Text>
                      </View>
                    )}
                    {wellness.hrv != null && (
                      <View style={styles.wellnessStat}>
                        <Text style={styles.wellnessLabel}>HRV</Text>
                        <Text style={styles.wellnessValue}>{wellness.hrv}ms</Text>
                      </View>
                    )}
                    {wellness.rhr != null && (
                      <View style={styles.wellnessStat}>
                        <Text style={styles.wellnessLabel}>Resting HR</Text>
                        <Text style={styles.wellnessValue}>{wellness.rhr} bpm</Text>
                      </View>
                    )}
                    {wellness.readinessScore != null && (
                      <View style={styles.wellnessStat}>
                        <Text style={styles.wellnessLabel}>Readiness</Text>
                        <Text style={styles.wellnessValue}>{wellness.readinessScore}/100</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.wellnessSource}>
                    From {wellness.source === 'apple_health' ? 'Apple Health' : 'intervals.icu'}
                  </Text>
                </View>
              )}

              {/* Sleep Quality picker — only hidden when objective sleep
                  data is in the wellness card. If the wellness source only
                  brought RHR/HRV (e.g. a Garmin user whose watch doesn't
                  write sleep to Apple Health), we still ask the question
                  manually. */}
              {(!wellness || wellness.sleepSeconds == null) && (
                <>
                  <Text style={styles.question}>How did you sleep?</Text>
                  <View style={styles.optionsRow}>
                    {SLEEP_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.option, sleepQuality === opt.value && styles.optionSelected]}
                        onPress={() => setSleepQuality(opt.value)}
                      >
                        <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                        <Text style={styles.optionLabel}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.question}>How are you feeling?</Text>
              <View style={styles.optionsRow}>
                {FEELING_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.option, feeling === opt.value && styles.optionSelected]}
                    onPress={() => setFeeling(opt.value)}
                  >
                    <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.question}>Any notes? (optional)</Text>
              <TextInput
                style={styles.textArea}
                value={notes}
                onChangeText={setNotes}
                placeholder="Pain, illness, life stress..."
                placeholderTextColor="#475569"
                multiline
                numberOfLines={3}
                onFocus={() => {
                  // Scroll the notes field (and the Check In button below it)
                  // into view above the keyboard.
                  setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 250);
                }}
              />

              {(() => {
                const sleepPickerVisible = !wellness || wellness.sleepSeconds == null;
                const disabled = (sleepPickerVisible && !sleepQuality) || !feeling || saving;
                return (
                  <TouchableOpacity
                    style={[styles.btn, disabled && styles.btnDisabled]}
                    onPress={handleSubmitCheckIn}
                    disabled={disabled}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.btnText}>Check In →</Text>
                    )}
                  </TouchableOpacity>
                );
              })()}
            </>
          ) : (
            <>
              {/* Today's workout */}
              {analysis?.todaysWorkout && (
                <View style={styles.workoutCard}>
                  <Text style={styles.workoutLabel}>Today's Workout</Text>
                  <Text style={styles.workoutName}>{analysis.todaysWorkout.name}</Text>
                  <Text style={styles.workoutMeta}>
                    {analysis.todaysWorkout.duration}min · {analysis.todaysWorkout.type} · TSS {analysis.todaysWorkout.tss}
                  </Text>
                </View>
              )}

              {/* Recommendation */}
              {readiness?.recommendation && (
                <View style={[
                  styles.recCard,
                  { borderLeftColor: RECOMMENDATION_COLORS[readiness.recommendation] || '#64748b' }
                ]}>
                  <Text style={styles.recTitle}>
                    Recommendation: {readiness.recommendation.charAt(0).toUpperCase() + readiness.recommendation.slice(1)}
                  </Text>
                  <Text style={styles.recText}>{readiness.reasoning}</Text>
                </View>
              )}

              {/* TSB info */}
              {analysis && (
                <View style={styles.tsbRow}>
                  <TsbStat label="CTL (Fitness)" value={Math.round(analysis.currentCTL)} />
                  <TsbStat label="ATL (Fatigue)" value={Math.round(analysis.currentATL)} />
                  <TsbStat label="TSB (Form)" value={Math.round(analysis.currentTSB)} />
                </View>
              )}

              <TouchableOpacity style={styles.btn} onPress={handleChatAboutPlan}>
                <Text style={styles.btnText}>Discuss with AI Coach</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.continueBtn} onPress={handleDismiss}>
                <Text style={styles.continueBtnText}>Continue</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TsbStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.tsbStat}>
      <Text style={styles.tsbValue}>{value}</Text>
      <Text style={styles.tsbLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#f1f5f9' },
  close: { fontSize: 18, color: '#64748b' },
  content: { padding: 20, paddingBottom: 60, gap: 16 },
  question: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  option: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 2,
    alignItems: 'center',
    gap: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#1e3a5f',
  },
  optionEmoji: { fontSize: 22 },
  optionLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '500', textAlign: 'center' },
  wellnessCard: {
    backgroundColor: '#2a1f3d',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#a78bfa',
    marginBottom: 8,
  },
  wellnessTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e9d5ff',
    marginBottom: 10,
  },
  wellnessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  wellnessStat: {
    minWidth: '40%',
  },
  wellnessLabel: {
    fontSize: 10,
    color: '#a78bfa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  wellnessValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  wellnessSource: {
    fontSize: 11,
    color: '#a78bfa',
    marginTop: 8,
  },
  waitCard: {
    backgroundColor: '#1f1810',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#fbbf24',
    marginBottom: 8,
  },
  waitTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fcd34d',
    marginBottom: 8,
  },
  waitBody: {
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: 20,
  },
  waitMeta: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
    fontStyle: 'italic',
  },
  skipBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  skipBtnText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  textArea: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#f1f5f9',
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#334155',
  },
  btn: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  continueBtn: {
    backgroundColor: 'transparent',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  continueBtnText: { color: '#cbd5e1', fontWeight: '600', fontSize: 15 },
  workoutCard: {
    backgroundColor: '#1e3a5f',
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  workoutLabel: { fontSize: 11, color: '#60a5fa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  workoutName: { fontSize: 16, fontWeight: '600', color: '#f1f5f9' },
  workoutMeta: { fontSize: 13, color: '#93c5fd' },
  recCard: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    gap: 6,
  },
  recTitle: { fontSize: 14, fontWeight: '700', color: '#f1f5f9' },
  recText: { fontSize: 13, color: '#94a3b8', lineHeight: 18 },
  tsbRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
  },
  tsbStat: { alignItems: 'center', gap: 4 },
  tsbValue: { fontSize: 20, fontWeight: '700', color: '#f1f5f9' },
  tsbLabel: { fontSize: 11, color: '#64748b', textAlign: 'center' },
});
