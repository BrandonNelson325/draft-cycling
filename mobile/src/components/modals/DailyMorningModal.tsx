import React, { useState } from 'react';
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
}

type SleepQuality = 'poor' | 'good' | 'great';
type Feeling = 'tired' | 'normal' | 'energized';

const SLEEP_OPTIONS: { value: SleepQuality; emoji: string; label: string }[] = [
  { value: 'poor', emoji: '😴', label: 'Poor' },
  { value: 'good', emoji: '😊', label: 'Good' },
  { value: 'great', emoji: '🌟', label: 'Great' },
];

const FEELING_OPTIONS: { value: Feeling; emoji: string; label: string }[] = [
  { value: 'tired', emoji: '😓', label: 'Tired' },
  { value: 'normal', emoji: '🙂', label: 'Normal' },
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
}: DailyMorningModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [sleepQuality, setSleepQuality] = useState<SleepQuality | null>(null);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep(1);
    setSleepQuality(null);
    setFeeling(null);
    setNotes('');
  };

  const handleSubmitCheckIn = async () => {
    if (!sleepQuality || !feeling) {
      Alert.alert('Please answer both questions.');
      return;
    }

    setSaving(true);
    try {
      const checkInData: DailyCheckInData = {
        sleepQuality,
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
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {step === 1 ? 'Good Morning! 🌅' : 'Your Day Ahead'}
          </Text>
          <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {step === 1 ? (
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
              />

              <TouchableOpacity
                style={[styles.btn, (!sleepQuality || !feeling || saving) && styles.btnDisabled]}
                onPress={handleSubmitCheckIn}
                disabled={!sleepQuality || !feeling || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Check In →</Text>
                )}
              </TouchableOpacity>
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

              <TouchableOpacity style={styles.skipBtn} onPress={handleDismiss}>
                <Text style={styles.skipText}>Dismiss</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
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
  content: { padding: 20, gap: 16 },
  question: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  option: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#1e3a5f',
  },
  optionEmoji: { fontSize: 24 },
  optionLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },
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
  skipBtn: { alignItems: 'center', marginTop: 8, padding: 10 },
  skipText: { color: '#64748b', fontSize: 14 },
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
