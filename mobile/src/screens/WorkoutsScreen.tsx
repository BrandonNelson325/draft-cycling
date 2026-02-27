import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { workoutService, type Workout } from '../services/workoutService';
import WorkoutDetailSheet from '../components/workout/WorkoutDetailSheet';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';

const TYPES = ['all', 'endurance', 'tempo', 'threshold', 'vo2max', 'sprint', 'recovery', 'custom'];

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

export default function WorkoutsScreen() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await workoutService.getWorkouts();
      setWorkouts(data);
    } catch {
      setWorkouts([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = typeFilter === 'all'
    ? workouts
    : workouts.filter(w => w.workout_type === typeFilter);

  const openDetail = (workout: Workout) => {
    setSelectedWorkout(workout);
    sheetRef.current?.snapToIndex(0);
  };

  const renderItem = ({ item }: { item: Workout }) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetail(item)}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <Badge
          label={item.workout_type}
          color={TYPE_COLORS[item.workout_type] || '#1e293b'}
          textColor={TYPE_TEXT[item.workout_type] || '#94a3b8'}
        />
      </View>
      <Text style={styles.cardMeta}>
        {item.duration_minutes}min
        {item.tss ? ` · TSS ${item.tss}` : ''}
        {item.generated_by_ai ? ' · AI' : ''}
      </Text>
      {item.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Type filter */}
      <FlatList
        data={TYPES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={t => t}
        style={styles.filterList}
        contentContainerStyle={styles.filterContent}
        renderItem={({ item: t }) => (
          <TouchableOpacity
            style={[styles.chip, typeFilter === t && styles.chipActive]}
            onPress={() => setTypeFilter(t)}
          >
            <Text style={[styles.chipText, typeFilter === t && styles.chipTextActive]}>
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        )}
      />

      {loading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={w => w.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="barbell-outline"
              title="No workouts found"
              subtitle="Create workouts by chatting with the AI coach."
            />
          }
        />
      )}

      {/* Workout detail sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['85%']}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <WorkoutDetailSheet workout={selectedWorkout} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  filterList: { maxHeight: 52 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1e293b',
  },
  chipActive: { backgroundColor: '#1e3a5f' },
  chipText: { color: '#64748b', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#60a5fa' },
  list: { padding: 16, paddingTop: 8 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  cardMeta: { fontSize: 12, color: '#64748b' },
  cardDesc: { fontSize: 13, color: '#94a3b8', lineHeight: 18 },
  sheetBg: { backgroundColor: '#1e293b' },
  sheetHandle: { backgroundColor: '#475569' },
});
