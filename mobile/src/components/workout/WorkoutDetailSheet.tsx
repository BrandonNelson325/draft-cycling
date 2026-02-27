import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { Workout } from '../../services/workoutService';
import { workoutService } from '../../services/workoutService';
import IntervalVisualizer from './IntervalVisualizer';
import Badge from '../ui/Badge';

interface WorkoutDetailSheetProps {
  workout: Workout | null;
  onClose?: () => void;
  onScheduled?: () => void;
}

export default function WorkoutDetailSheet({ workout, onClose, onScheduled }: WorkoutDetailSheetProps) {
  const [downloading, setDownloading] = useState<'zwo' | 'fit' | null>(null);

  if (!workout) return null;

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
    <BottomSheetScrollView contentContainerStyle={styles.content}>
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

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, downloading === 'zwo' && styles.actionDisabled]}
          onPress={() => handleDownload('zwo')}
          disabled={!!downloading}
        >
          {downloading === 'zwo' ? (
            <ActivityIndicator size="small" color="#60a5fa" />
          ) : (
            <Text style={styles.actionBtnText}>Download ZWO</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, downloading === 'fit' && styles.actionDisabled]}
          onPress={() => handleDownload('fit')}
          disabled={!!downloading}
        >
          {downloading === 'fit' ? (
            <ActivityIndicator size="small" color="#60a5fa" />
          ) : (
            <Text style={styles.actionBtnText}>Download FIT</Text>
          )}
        </TouchableOpacity>
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
