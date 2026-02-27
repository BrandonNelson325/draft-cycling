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
import { activityFeedbackService } from '../../services/activityFeedbackService';
import type { UnacknowledgedActivity, ActivityFeedback } from '../../services/activityFeedbackService';
import { useAuthStore } from '../../stores/useAuthStore';

interface PostRideModalProps {
  activity: UnacknowledgedActivity | null;
  onAcknowledge: (feedback: ActivityFeedback) => void;
  onSkip: () => void;
}

const RPE_EMOJIS = [
  { value: 1, emoji: '😴', label: 'Very Easy' },
  { value: 2, emoji: '🙂', label: 'Easy' },
  { value: 3, emoji: '😊', label: 'Moderate' },
  { value: 4, emoji: '😤', label: 'Hard' },
  { value: 5, emoji: '😵', label: 'Max' },
];

export default function PostRideModal({ activity, onAcknowledge, onSkip }: PostRideModalProps) {
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { user } = useAuthStore();
  const isAdvanced = user?.display_mode !== 'simple';

  if (!activity) return null;

  const distanceKm = activity.distance_meters ? (activity.distance_meters / 1000).toFixed(1) : null;
  const durationMin = activity.moving_time_seconds ? Math.round(activity.moving_time_seconds / 60) : null;
  const avgPower = activity.average_watts ? Math.round(activity.average_watts) : null;

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
              {distanceKm && <StatBadge label="Distance" value={`${distanceKm}km`} />}
              {durationMin && <StatBadge label="Duration" value={`${durationMin}min`} />}
              {avgPower && <StatBadge label="Avg Power" value={`${avgPower}W`} />}
              {activity.tss && <StatBadge label="TSS" value={String(Math.round(activity.tss))} />}
            </View>
          </View>

          <Text style={styles.question}>How hard was it? (RPE)</Text>

          {/* Simple mode: emoji buttons */}
          <View style={styles.rpeRow}>
            {RPE_EMOJIS.map(r => (
              <TouchableOpacity
                key={r.value}
                style={[styles.rpeBtn, rpe === r.value && styles.rpeBtnSelected]}
                onPress={() => setRpe(r.value)}
              >
                <Text style={styles.rpeEmoji}>{r.emoji}</Text>
                {isAdvanced && <Text style={styles.rpeLabel}>{r.label}</Text>}
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
