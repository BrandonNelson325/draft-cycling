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
import type { UnacknowledgedActivity, ActivityFeedback } from '../../services/activityFeedbackService';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';

interface PostRideModalProps {
  activity: UnacknowledgedActivity | null;
  onAcknowledge: (feedback: ActivityFeedback) => void;
  onSkip: () => void;
  onNavigateToChat?: (message: string) => void;
}

const RPE_EMOJIS = [
  { value: 1, emoji: '\u{1F634}', label: 'Very Easy' },
  { value: 2, emoji: '\u{1F642}', label: 'Easy' },
  { value: 3, emoji: '\u{1F624}', label: 'Moderate' },
  { value: 4, emoji: '\u{1F4AA}', label: 'Hard' },
  { value: 5, emoji: '\u{1F525}', label: 'Max' },
];

const WORKOUT_TYPE_LABELS: Record<string, string> = {
  endurance: 'Endurance',
  tempo: 'Tempo',
  threshold: 'Threshold',
  vo2max: 'VO2max',
  sprint: 'Sprint',
  recovery: 'Recovery',
  custom: 'Custom',
};

export default function PostRideModal({ activity, onAcknowledge, onSkip, onNavigateToChat }: PostRideModalProps) {
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [wasPlanned, setWasPlanned] = useState<boolean | null>(null);
  const [showAdaptPrompt, setShowAdaptPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuthStore();
  const units = getConversionUtils(user);
  const isAdvanced = user?.display_mode !== 'simple';

  if (!activity) return null;

  const planned = activity.plannedWorkout;
  const distanceDisplay = activity.distance_meters ? units.formatDistance(activity.distance_meters) : null;
  const durationMin = activity.moving_time_seconds ? Math.round(activity.moving_time_seconds / 60) : null;
  const avgPower = activity.average_watts ? Math.round(activity.average_watts) : null;

  // Default wasPlanned based on match confidence
  const effectiveWasPlanned = wasPlanned ?? (planned && activity.matchConfidence === 'high' ? true : null);

  const handleSubmit = async () => {
    if (!rpe) {
      Alert.alert('Please rate your effort.');
      return;
    }
    setSaving(true);
    try {
      await onAcknowledge({
        perceived_effort: rpe,
        notes: notes.trim() || undefined,
        was_planned_workout: planned ? effectiveWasPlanned ?? undefined : undefined,
        calendar_entry_id: planned ? planned.calendarEntryId : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={!!activity}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onSkip}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Post-Ride Feedback</Text>
          <TouchableOpacity onPress={onSkip}>
            <Text style={styles.close}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Activity info */}
          <View style={styles.activityCard}>
            <Text style={styles.activityName} numberOfLines={2}>{activity.name || 'Ride'}</Text>
            <View style={styles.statsRow}>
              {distanceDisplay && <StatBadge label="Distance" value={`${distanceDisplay}${units.distanceUnitShort}`} />}
              {durationMin && <StatBadge label="Duration" value={`${durationMin}min`} />}
              {avgPower && <StatBadge label="Avg Power" value={`${avgPower}W`} />}
              {activity.calories && <StatBadge label="Calories" value={String(activity.calories)} />}
              {activity.tss && <StatBadge label="TSS" value={String(Math.round(activity.tss))} />}
            </View>
          </View>

          {/* Planned workout section */}
          {planned && (
            <View style={styles.plannedSection}>
              <Text style={styles.plannedLabel}>Planned for today</Text>
              <View style={styles.plannedCard}>
                <View style={styles.plannedHeader}>
                  <Text style={styles.plannedName} numberOfLines={1}>{planned.workoutName}</Text>
                  <View style={styles.plannedTypeBadge}>
                    <Text style={styles.plannedTypeText}>
                      {WORKOUT_TYPE_LABELS[planned.workoutType] || planned.workoutType}
                    </Text>
                  </View>
                </View>
                <View style={styles.plannedStats}>
                  <Text style={styles.plannedStat}>{planned.plannedDuration}min</Text>
                  {planned.plannedTSS && (
                    <Text style={styles.plannedStat}>TSS {Math.round(planned.plannedTSS)}</Text>
                  )}
                </View>
                {planned.description && (
                  <Text style={styles.plannedDesc} numberOfLines={2}>{planned.description}</Text>
                )}

                {/* Was this your planned workout? */}
                <View style={styles.matchQuestion}>
                  {!showAdaptPrompt ? (
                    <>
                      <Text style={styles.matchLabel}>Was this your planned workout?</Text>
                      <View style={styles.matchBtns}>
                        <TouchableOpacity
                          style={[
                            styles.matchBtn,
                            effectiveWasPlanned === true && styles.matchBtnYes,
                          ]}
                          onPress={() => setWasPlanned(true)}
                        >
                          <Text style={[
                            styles.matchBtnText,
                            effectiveWasPlanned === true && styles.matchBtnTextActive,
                          ]}>Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.matchBtn,
                            effectiveWasPlanned === false && styles.matchBtnNo,
                          ]}
                          onPress={() => {
                            setWasPlanned(false);
                            setShowAdaptPrompt(true);
                          }}
                        >
                          <Text style={[
                            styles.matchBtnText,
                            effectiveWasPlanned === false && styles.matchBtnTextActive,
                          ]}>No</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.adaptLabel}>Want to adapt your training plan?</Text>
                      <Text style={styles.adaptDesc}>
                        Your coach can suggest changes based on what you did instead.
                      </Text>
                      <View style={styles.matchBtns}>
                        <TouchableOpacity
                          style={[styles.matchBtn, styles.matchBtnYes]}
                          onPress={async () => {
                            setSaving(true);
                            try {
                              await onAcknowledge({
                                perceived_effort: rpe ?? undefined,
                                notes: notes.trim() || undefined,
                                was_planned_workout: false,
                                calendar_entry_id: planned?.calendarEntryId,
                              });
                              const msg = `I just finished "${activity.name || 'a ride'}" but it wasn't my planned workout "${planned?.workoutName}". Can you help me adapt my training plan?`;
                              onNavigateToChat?.(msg);
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          <Text style={[styles.matchBtnText, styles.matchBtnTextActive]}>Yes, adapt</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.matchBtn]}
                          onPress={() => setShowAdaptPrompt(false)}
                        >
                          <Text style={styles.matchBtnText}>No thanks</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              </View>
            </View>
          )}

          <Text style={styles.question}>How hard was it? (RPE)</Text>

          <View style={styles.rpeRow}>
            {RPE_EMOJIS.map(r => (
              <TouchableOpacity
                key={r.value}
                style={[styles.rpeBtn, rpe === r.value && styles.rpeBtnSelected]}
                onPress={() => setRpe(r.value)}
              >
                <Text style={styles.rpeEmoji}>{r.emoji}</Text>
                <Text style={styles.rpeLabel}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {isAdvanced && (
            <>
              <Text style={styles.question}>Notes (optional)</Text>
              <TextInput
                style={styles.textArea}
                value={notes}
                onChangeText={setNotes}
                placeholder="How did the workout feel? Any issues?"
                placeholderTextColor="#475569"
                multiline
                numberOfLines={3}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.btn, (!rpe || saving) && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={!rpe || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Save Feedback</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBadge}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  close: { fontSize: 15, color: '#64748b' },
  content: { padding: 20, gap: 16 },
  activityCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  activityName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBadge: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  statValue: { fontSize: 15, fontWeight: '700', color: '#f1f5f9' },
  statLabel: { fontSize: 11, color: '#64748b' },

  // Planned workout section
  plannedSection: { gap: 8 },
  plannedLabel: { fontSize: 13, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  plannedCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  plannedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  plannedName: { fontSize: 15, fontWeight: '600', color: '#f1f5f9', flex: 1 },
  plannedTypeBadge: {
    backgroundColor: '#1e3a5f',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  plannedTypeText: { fontSize: 11, fontWeight: '600', color: '#60a5fa' },
  plannedStats: { flexDirection: 'row', gap: 12 },
  plannedStat: { fontSize: 13, color: '#94a3b8' },
  plannedDesc: { fontSize: 12, color: '#64748b', lineHeight: 18 },

  // Match question
  matchQuestion: {
    marginTop: 4,
    gap: 8,
  },
  matchLabel: { fontSize: 13, fontWeight: '500', color: '#cbd5e1' },
  adaptLabel: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  adaptDesc: { fontSize: 12, color: '#94a3b8', lineHeight: 18, marginBottom: 4 },
  matchBtns: { flexDirection: 'row', gap: 10 },
  matchBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  matchBtnYes: {
    borderColor: '#22c55e',
    backgroundColor: '#052e16',
  },
  matchBtnNo: {
    borderColor: '#f97316',
    backgroundColor: '#431407',
  },
  matchBtnText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  matchBtnTextActive: { color: '#f1f5f9' },

  question: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  rpeRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  rpeBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 4,
  },
  rpeBtnSelected: {
    borderColor: '#3b82f6',
    backgroundColor: '#1e3a5f',
  },
  rpeEmoji: { fontSize: 22 },
  rpeLabel: { fontSize: 10, color: '#94a3b8', textAlign: 'center' },
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
});
