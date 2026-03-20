import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { Workout } from '../../services/workoutService';
import { workoutService } from '../../services/workoutService';
import { calendarService } from '../../services/calendarService';
import IntervalVisualizer from './IntervalVisualizer';
import Badge from '../ui/Badge';

interface WorkoutDetailSheetProps {
  workout: Workout | null;
  onClose?: () => void;
  onScheduled?: () => void;
  showSchedule?: boolean;
}

export default function WorkoutDetailSheet({ workout, onClose, onScheduled, showSchedule = false }: WorkoutDetailSheetProps) {
  const [downloading, setDownloading] = useState<'zwo' | 'fit' | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scheduling, setScheduling] = useState(false);

  if (!workout) return null;

  const handleSchedule = async (date: Date) => {
    setScheduling(true);
    try {
      await calendarService.scheduleWorkout(workout.id, date);
      Alert.alert('Scheduled', `${workout.name} added to your calendar.`);
      setShowDatePicker(false);
      onScheduled?.();
    } catch {
      Alert.alert('Error', 'Failed to schedule workout.');
    } finally {
      setScheduling(false);
    }
  };

  const handleDownload = async (type: 'zwo' | 'fit') => {
    setDownloading(type);
    try {
      if (type === 'zwo') {
        await workoutService.downloadZWO(workout.id, workout.name);
      } else {
        await workoutService.downloadFIT(workout.id, workout.name);
      }
    } catch {
      Alert.alert('Download Failed', 'Could not download workout file.');
    } finally {
      setDownloading(null);
    }
  };

  const TYPE_COLORS: Record<string, string> = {
    endurance: '#1e3a5f',
    tempo: '#1e3a1f',
    threshold: '#2d1f00',
    vo2max: '#2a1040',
    sprint: '#3f1020',
    recovery: '#1f2d3f',
    custom: '#1e2d20',
  };

  const TYPE_TEXT: Record<string, string> = {
    endurance: '#60a5fa',
    tempo: '#4ade80',
    threshold: '#fbbf24',
    vo2max: '#c084fc',
    sprint: '#f87171',
    recovery: '#94a3b8',
    custom: '#6ee7b7',
  };

  return (
    <BottomSheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.name}>{workout.name}</Text>
        <Badge
          label={workout.workout_type}
          color={TYPE_COLORS[workout.workout_type] || '#1e293b'}
          textColor={TYPE_TEXT[workout.workout_type] || '#94a3b8'}
        />
      </View>

      <View style={styles.stats}>
        <StatItem label="Duration" value={`${workout.duration_minutes}min`} />
        {workout.tss && <StatItem label="TSS" value={String(workout.tss)} />}
        {workout.generated_by_ai && <StatItem label="Source" value="AI Generated" />}
      </View>

      {workout.description && (
        <Text style={styles.description}>{workout.description}</Text>
      )}

      {workout.intervals?.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Intervals</Text>
          <IntervalVisualizer intervals={workout.intervals} />
        </View>
      )}

      {/* Schedule button — only from workouts browse, not calendar */}
      {showSchedule && (
        <>
          <Pressable
            style={styles.scheduleBtn}
            onPress={() => setShowDatePicker(true)}
            disabled={scheduling}
          >
            {scheduling ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.scheduleBtnText}>Schedule to Calendar</Text>
            )}
          </Pressable>

          {showDatePicker && (
            <View style={styles.datePickerContainer}>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                minimumDate={new Date()}
                themeVariant="dark"
                onChange={(event, date) => {
                  if (Platform.OS === 'android') {
                    setShowDatePicker(false);
                    if (event.type === 'set' && date) handleSchedule(date);
                  } else if (date) {
                    setSelectedDate(date);
                  }
                }}
              />
              {Platform.OS === 'ios' && (
                <View style={styles.datePickerActions}>
                  <Pressable onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.datePickerCancel}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={() => handleSchedule(selectedDate)}>
                    <Text style={styles.datePickerConfirm}>Confirm</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, downloading === 'zwo' && styles.actionDisabled]}
          onPress={() => handleDownload('zwo')}
          disabled={!!downloading}
        >
          {downloading === 'zwo' ? (
            <ActivityIndicator size="small" color="#60a5fa" />
          ) : (
            <Text style={styles.actionBtnText}>Download ZWO</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.actionBtn, downloading === 'fit' && styles.actionDisabled]}
          onPress={() => handleDownload('fit')}
          disabled={!!downloading}
        >
          {downloading === 'fit' ? (
            <ActivityIndicator size="small" color="#60a5fa" />
          ) : (
            <Text style={styles.actionBtnText}>Download FIT</Text>
          )}
        </Pressable>
      </View>
    </BottomSheetScrollView>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  stats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#f1f5f9' },
  statLabel: { fontSize: 11, color: '#64748b' },
  description: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
    marginBottom: 16,
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scheduleBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  scheduleBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  datePickerContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 8,
    marginBottom: 12,
  },
  datePickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  datePickerCancel: { color: '#64748b', fontSize: 15, fontWeight: '600' },
  datePickerConfirm: { color: '#3b82f6', fontSize: 15, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionDisabled: { opacity: 0.5 },
  actionBtnText: { color: '#60a5fa', fontWeight: '600', fontSize: 13 },
});
