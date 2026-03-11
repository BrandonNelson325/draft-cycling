import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { calendarService, type CalendarData, type CalendarEntry, type StravaActivity } from '../services/calendarService';
import { workoutService, type Workout } from '../services/workoutService';
import { trainingPlanService, type TrainingPlan } from '../services/trainingPlanService';
import { parseLocalDate, toDateString } from '../utils/date';
import { useAuthStore } from '../stores/useAuthStore';
import { getConversionUtils } from '../utils/units';
import WorkoutDetailSheet from '../components/workout/WorkoutDetailSheet';
import ActivityDetailSheet from '../components/activity/ActivityDetailSheet';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SNAP_POINTS_DAY = ['70%', '90%'];
const SNAP_POINTS_PICKER = ['80%'];
const SNAP_POINTS_DETAIL = ['60%', '85%'];

const PHASE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  base: { bg: '#1e3a5f', text: '#60a5fa', bar: '#3b82f6' },
  build: { bg: '#1e3a1f', text: '#4ade80', bar: '#22c55e' },
  peak: { bg: '#3f1020', text: '#f87171', bar: '#ef4444' },
  taper: { bg: '#2d1f00', text: '#fbbf24', bar: '#f59e0b' },
};

function TrainingPlanSummary({ plan }: { plan: TrainingPlan }) {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(() => {
    const planStart = parseLocalDate(plan.start_date);
    const daysSinceStart = Math.floor((new Date().getTime() - planStart.getTime()) / (1000 * 60 * 60 * 24));
    const currentWeekNum = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
    return new Set([currentWeekNum]);
  });

  const totalWorkouts = plan.weeks.reduce((sum, w) => sum + w.workouts.length, 0);
  const avgWeeklyTss = Math.round(plan.total_tss / plan.weeks.length);
  const workoutsPerWeek = (totalWorkouts / plan.weeks.length).toFixed(1);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const formatDate = (dateStr: string) => {
    const d = parseLocalDate(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getWeekDates = (weekNumber: number) => {
    const start = parseLocalDate(plan.start_date);
    start.setDate(start.getDate() + (weekNumber - 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      start: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      end: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  };

  const toggleWeek = (weekNum: number) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(weekNum)) next.delete(weekNum);
      else next.add(weekNum);
      return next;
    });
  };

  return (
    <View style={planStyles.container}>
      {/* Plan Overview */}
      <View style={planStyles.overviewCard}>
        <View style={planStyles.overviewHeader}>
          <View style={{ flex: 1 }}>
            <Text style={planStyles.goalLabel}>Goal Event</Text>
            <Text style={planStyles.goalEvent}>{plan.goal_event}</Text>
            <Text style={planStyles.dateRange}>
              {formatDate(plan.start_date)} → {formatDate(plan.event_date)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={planStyles.goalLabel}>Duration</Text>
            <Text style={planStyles.goalEvent}>{plan.weeks.length}w</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={planStyles.statsGrid}>
          <View style={planStyles.statBox}>
            <Text style={planStyles.statValue}>{plan.total_tss}</Text>
            <Text style={planStyles.statLabel}>Total TSS</Text>
          </View>
          <View style={planStyles.statBox}>
            <Text style={planStyles.statValue}>{totalWorkouts}</Text>
            <Text style={planStyles.statLabel}>Workouts</Text>
          </View>
          <View style={planStyles.statBox}>
            <Text style={planStyles.statValue}>{avgWeeklyTss}</Text>
            <Text style={planStyles.statLabel}>Avg TSS/wk</Text>
          </View>
          <View style={planStyles.statBox}>
            <Text style={planStyles.statValue}>{workoutsPerWeek}</Text>
            <Text style={planStyles.statLabel}>WO/wk</Text>
          </View>
        </View>

        {/* Phase Badges */}
        <View style={planStyles.phaseLegend}>
          {(['base', 'build', 'peak', 'taper'] as const).map(phase => {
            const count = plan.weeks.filter(w => w.phase === phase).length;
            if (!count) return null;
            const c = PHASE_COLORS[phase];
            return (
              <View key={phase} style={[planStyles.phaseChip, { backgroundColor: c.bg }]}>
                <Text style={[planStyles.phaseChipText, { color: c.text }]}>
                  {phase.charAt(0).toUpperCase() + phase.slice(1)}: {count}w
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Week Breakdown */}
      <Text style={planStyles.sectionTitle}>Week Breakdown</Text>
      {plan.weeks.map(week => {
        const isExpanded = expandedWeeks.has(week.week_number);
        const dates = getWeekDates(week.week_number);
        const phaseColor = PHASE_COLORS[week.phase] || PHASE_COLORS.base;

        return (
          <View key={week.week_number} style={[planStyles.weekCard, { borderLeftColor: phaseColor.bar }]}>
            <TouchableOpacity
              style={planStyles.weekHeader}
              onPress={() => toggleWeek(week.week_number)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color="#64748b"
              />
              <View style={{ flex: 1 }}>
                <View style={planStyles.weekTitleRow}>
                  <Text style={planStyles.weekTitle}>Week {week.week_number}</Text>
                  <View style={[planStyles.phaseBadge, { backgroundColor: phaseColor.bg }]}>
                    <Text style={[planStyles.phaseBadgeText, { color: phaseColor.text }]}>
                      {week.phase.charAt(0).toUpperCase() + week.phase.slice(1)}
                    </Text>
                  </View>
                </View>
                <Text style={planStyles.weekMeta}>
                  {dates.start} – {dates.end} · {week.workouts.length} workouts · {week.tss} TSS
                </Text>
                {week.notes && <Text style={planStyles.weekNotes}>{week.notes}</Text>}
              </View>
            </TouchableOpacity>

            {isExpanded && (
              <View style={planStyles.weekWorkouts}>
                {week.workouts.map((wo, idx) => (
                  <View key={idx} style={planStyles.woCard}>
                    <View style={planStyles.woCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={planStyles.woName}>{wo.name}</Text>
                        <Text style={planStyles.woDay}>{dayNames[wo.day_of_week]}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={planStyles.woDuration}>{wo.duration_minutes} min</Text>
                        <Text style={planStyles.woType}>{wo.workout_type}</Text>
                      </View>
                    </View>
                    {wo.description ? (
                      <Text style={planStyles.woDesc} numberOfLines={3}>{wo.description}</Text>
                    ) : null}
                    {wo.rationale ? (
                      <Text style={planStyles.woRationale}>💡 {wo.rationale}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const planStyles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginTop: 16,
    gap: 10,
  },
  overviewCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  goalLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 2,
  },
  goalEvent: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  dateRange: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  phaseLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  phaseChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  phaseChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 4,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  weekCard: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  weekTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  phaseBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  phaseBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  weekMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  weekNotes: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 2,
  },
  weekWorkouts: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  woCard: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  woCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  woName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  woDay: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  woDuration: {
    fontSize: 13,
    fontWeight: '500',
    color: '#f1f5f9',
  },
  woType: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'capitalize',
    marginTop: 1,
  },
  woDesc: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 6,
    lineHeight: 17,
  },
  woRationale: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
});

export default function CalendarScreen() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calData, setCalData] = useState<CalendarData>({ scheduledWorkouts: [], stravaActivities: [] });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [allWorkouts, setAllWorkouts] = useState<Workout[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<StravaActivity | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);

  const { user } = useAuthStore();
  const units = getConversionUtils(user);

  const daySheetRef = useRef<BottomSheet>(null);
  const pickerSheetRef = useRef<BottomSheet>(null);
  const workoutSheetRef = useRef<BottomSheet>(null);
  const activitySheetRef = useRef<BottomSheet>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    if (!user) return;
    loadCalendar();
  }, [year, month, user?.id]);

  useEffect(() => {
    if (!user) return;
    trainingPlanService.getActivePlan().then(setPlan).catch(() => setPlan(null));
  }, [user?.id]);

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      const data = await calendarService.getCalendar(start, end);
      setCalData(data);
    } catch (err) {
      console.error('Calendar load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const getDateStr = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const workoutsByDate = calData.scheduledWorkouts.reduce<Record<string, CalendarEntry[]>>((acc, entry) => {
    const d = entry.scheduled_date?.slice(0, 10);
    if (d) acc[d] = [...(acc[d] || []), entry];
    return acc;
  }, {});

  const activitiesByDate = calData.stravaActivities.reduce<Record<string, typeof calData.stravaActivities>>((acc, a) => {
    const d = a.start_date?.slice(0, 10);
    if (d) acc[d] = [...(acc[d] || []), a];
    return acc;
  }, {});

  const todayStr = toDateString(new Date());

  const onDayPress = (day: number) => {
    const dateStr = getDateStr(day);
    setSelectedDate(dateStr);
    daySheetRef.current?.snapToIndex(0);
  };

  const openPicker = async () => {
    try {
      const workouts = await workoutService.getWorkouts();
      setAllWorkouts(workouts);
      pickerSheetRef.current?.snapToIndex(0);
    } catch (err) {
      Alert.alert('Error', 'Failed to load workouts.');
    }
  };

  const scheduleWorkout = async (workout: Workout) => {
    if (!selectedDate) return;
    try {
      await calendarService.scheduleWorkout(workout.id, parseLocalDate(selectedDate));
      pickerSheetRef.current?.close();
      await loadCalendar();
    } catch {
      Alert.alert('Error', 'Failed to schedule workout.');
    }
  };

  const deleteEntry = async (entryId: string) => {
    Alert.alert('Delete Workout', 'Remove this workout from your calendar?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await calendarService.deleteEntry(entryId);
          await loadCalendar();
        },
      },
    ]);
  };

  const completeEntry = async (entryId: string) => {
    await calendarService.completeWorkout(entryId);
    await loadCalendar();
  };

  const selectedWorkouts = selectedDate ? workoutsByDate[selectedDate] || [] : [];
  const selectedActivities = selectedDate ? activitiesByDate[selectedDate] || [] : [];

  const filteredWorkouts = typeFilter === 'all'
    ? allWorkouts
    : allWorkouts.filter(w => w.workout_type === typeFilter);

  const TYPES = ['all', 'endurance', 'tempo', 'threshold', 'vo2max', 'sprint', 'recovery'];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView keyboardShouldPersistTaps="handled">
      {/* Calendar header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
        <TouchableOpacity onPress={goToday}>
          <Text style={styles.monthTitle}>
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-forward" size={22} color="#f1f5f9" />
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={styles.dayHeaders}>
        {DAYS.map(d => (
          <Text key={d} style={styles.dayHeader}>{d}</Text>
        ))}
      </View>

      {/* Grid */}
      {loading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (!day) return <View key={`empty-${i}`} style={styles.cell} />;
            const dateStr = getDateStr(day);
            const hasWorkouts = !!(workoutsByDate[dateStr]?.length);
            const hasActivities = !!(activitiesByDate[dateStr]?.length);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            return (
              <TouchableOpacity
                key={dateStr}
                style={[styles.cell, isSelected && styles.cellSelected, isToday && styles.cellToday]}
                onPress={() => onDayPress(day)}
              >
                <Text style={[styles.dayNum, isToday && styles.dayNumToday, isSelected && styles.dayNumSelected]}>
                  {day}
                </Text>
                <View style={styles.dots}>
                  {hasWorkouts && <View style={[styles.dot, { backgroundColor: '#3b82f6' }]} />}
                  {hasActivities && <View style={[styles.dot, { backgroundColor: '#f97316' }]} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Training Plan Summary (below calendar) */}
      {plan && <TrainingPlanSummary plan={plan} />}
      <View style={{ height: 16 }} />
      </ScrollView>

      {/* Day Detail Bottom Sheet */}
      <BottomSheet
        ref={daySheetRef}
        index={-1}
        snapPoints={SNAP_POINTS_DAY}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          {selectedDate && (
            <>
              <Text style={styles.sheetTitle}>
                {parseLocalDate(selectedDate).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}
              </Text>

              {selectedWorkouts.length === 0 && selectedActivities.length === 0 && (
                <Text style={styles.sheetEmpty}>Nothing scheduled for this day.</Text>
              )}

              {selectedWorkouts.map(entry => (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.entryCard}
                  onPress={() => {
                    if (entry.workouts) {
                      setSelectedWorkout(entry.workouts);
                      workoutSheetRef.current?.snapToIndex(0);
                    }
                  }}
                >
                  <View style={styles.entryLeft}>
                    <Text style={styles.entryName}>{entry.workouts?.name || 'Workout'}</Text>
                    <Text style={styles.entryMeta}>
                      {entry.workouts?.duration_minutes}min
                      {entry.workouts?.tss ? ` · TSS ${entry.workouts.tss}` : ''}
                      {entry.completed ? ' · ✓ Done' : ''}
                    </Text>
                  </View>
                  <View style={styles.entryActions}>
                    {!entry.completed && (
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          completeEntry(entry.id);
                        }}
                      >
                        <Text style={styles.actionBtnText}>Complete</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnDanger]}
                      onPress={(e) => {
                        e.stopPropagation();
                        deleteEntry(entry.id);
                      }}
                    >
                      <Ionicons name="trash-outline" size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}

              {selectedActivities.map(activity => (
                <TouchableOpacity
                  key={activity.id}
                  style={[styles.entryCard, styles.activityCard]}
                  onPress={() => {
                    setSelectedActivity(activity);
                    activitySheetRef.current?.snapToIndex(0);
                  }}
                >
                  <View style={[styles.activityDot]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryName}>{activity.name || 'Ride'}</Text>
                    <Text style={styles.entryMeta}>
                      {[
                        activity.distance_meters ? `${units.formatDistance(activity.distance_meters)} ${units.distanceUnitShort}` : null,
                        activity.moving_time_seconds ? `${Math.round(activity.moving_time_seconds / 60)}min` : null,
                        activity.average_watts ? `${Math.round(activity.average_watts)}w avg` : null,
                        activity.perceived_effort ? ({ 1: '😴', 2: '🙂', 3: '😤', 4: '💪', 5: '🔥' } as Record<number, string>)[activity.perceived_effort] : null,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={styles.addWorkoutBtn} onPress={openPicker}>
                <Ionicons name="add" size={18} color="#60a5fa" />
                <Text style={styles.addWorkoutText}>Add Workout</Text>
              </TouchableOpacity>
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Workout Picker Sheet */}
      <BottomSheet
        ref={pickerSheetRef}
        index={-1}
        snapPoints={SNAP_POINTS_PICKER}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Pick a Workout</Text>
          {/* Type filter chips */}
          <FlatList
            data={TYPES}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={t => t}
            style={styles.typeList}
            renderItem={({ item: t }) => (
              <TouchableOpacity
                style={[styles.typeChip, typeFilter === t && styles.typeChipActive]}
                onPress={() => setTypeFilter(t)}
              >
                <Text style={[styles.typeChipText, typeFilter === t && styles.typeChipTextActive]}>
                  {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            )}
          />
          <FlatList
            data={filteredWorkouts}
            keyExtractor={w => w.id}
            renderItem={({ item: w }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => scheduleWorkout(w)}>
                <Text style={styles.pickerName}>{w.name}</Text>
                <Text style={styles.pickerMeta}>
                  {w.duration_minutes}min · {w.workout_type}
                  {w.tss ? ` · TSS ${w.tss}` : ''}
                </Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      </BottomSheet>
      {/* Workout Detail Sheet */}
      <BottomSheet
        ref={workoutSheetRef}
        index={-1}
        snapPoints={SNAP_POINTS_DETAIL}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <WorkoutDetailSheet workout={selectedWorkout} onClose={() => workoutSheetRef.current?.close()} />
      </BottomSheet>

      {/* Activity Detail Sheet */}
      <BottomSheet
        ref={activitySheetRef}
        index={-1}
        snapPoints={SNAP_POINTS_DETAIL}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <ActivityDetailSheet activity={selectedActivity} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  dayHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    gap: 2,
  },
  cellSelected: { backgroundColor: '#1e3a5f' },
  cellToday: { borderWidth: 1, borderColor: '#3b82f6' },
  dayNum: { fontSize: 14, color: '#cbd5e1' },
  dayNumToday: { color: '#60a5fa', fontWeight: '700' },
  dayNumSelected: { color: '#f1f5f9', fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  sheetBg: { backgroundColor: '#1e293b' },
  sheetHandle: { backgroundColor: '#475569' },
  sheetContent: { padding: 20 },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 16,
  },
  sheetEmpty: {
    color: '#64748b',
    fontSize: 14,
    marginBottom: 16,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 10,
  },
  activityCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#f97316',
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f97316',
    flexShrink: 0,
  },
  entryLeft: { flex: 1 },
  entryName: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  entryMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  entryActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnDanger: { backgroundColor: '#450a0a' },
  actionBtnText: { color: '#60a5fa', fontSize: 12, fontWeight: '600' },
  addWorkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 10,
    justifyContent: 'center',
  },
  addWorkoutText: { color: '#60a5fa', fontWeight: '600', fontSize: 14 },
  typeList: { marginBottom: 12 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    marginRight: 8,
  },
  typeChipActive: { backgroundColor: '#1e3a5f' },
  typeChipText: { color: '#64748b', fontSize: 13, fontWeight: '500' },
  typeChipTextActive: { color: '#60a5fa' },
  pickerItem: {
    paddingVertical: 12,
  },
  pickerName: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  pickerMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  separator: { height: 1, backgroundColor: '#0f172a' },
});
