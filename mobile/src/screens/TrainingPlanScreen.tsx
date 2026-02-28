import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { trainingPlanService, type TrainingPlan, type TrainingWeek } from '../services/trainingPlanService';
import { parseLocalDate } from '../utils/date';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';

const PHASE_COLORS: Record<string, { bg: string; text: string }> = {
  base: { bg: '#1e3a5f', text: '#60a5fa' },
  build: { bg: '#1e3a1f', text: '#4ade80' },
  peak: { bg: '#3f1020', text: '#f87171' },
  taper: { bg: '#2d1f00', text: '#fbbf24' },
};

function WeekAccordion({ week }: { week: TrainingWeek }) {
  const [open, setOpen] = useState(false);
  const phase = PHASE_COLORS[week.phase] || { bg: '#1e293b', text: '#94a3b8' };

  return (
    <View style={styles.weekCard}>
      <TouchableOpacity
        style={styles.weekHeader}
        onPress={() => setOpen(!open)}
        activeOpacity={0.7}
      >
        <View style={styles.weekHeaderLeft}>
          <Text style={styles.weekNum}>Week {week.week_number}</Text>
          <Badge label={week.phase} color={phase.bg} textColor={phase.text} />
        </View>
        <View style={styles.weekHeaderRight}>
          <Text style={styles.weekTss}>TSS {week.tss}</Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#64748b"
          />
        </View>
      </TouchableOpacity>

      {open && (
        <View style={styles.weekBody}>
          {week.notes && <Text style={styles.weekNotes}>{week.notes}</Text>}
          {week.workouts.map((w, i) => (
            <View key={i} style={styles.workoutRow}>
              <Text style={styles.workoutDay}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][w.day_of_week]}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.workoutName}>{w.name}</Text>
                <Text style={styles.workoutMeta}>
                  {w.duration_minutes}min · {w.workout_type}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function TrainingPlanScreen({ navigation }: any) {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const p = await trainingPlanService.getActivePlan();
      setPlan(p);
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (!plan) return;
    Alert.alert('Cancel Plan', 'Are you sure you want to cancel your training plan?', [
      { text: 'Keep Plan', style: 'cancel' },
      {
        text: 'Cancel Plan',
        style: 'destructive',
        onPress: async () => {
          await trainingPlanService.deletePlan(plan.id);
          setPlan(null);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!plan) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          icon="calendar-outline"
          title="No Training Plan"
          subtitle="Choose a pre-built plan or have the AI coach build one custom for you."
          actionLabel="Browse Plans"
          onAction={() => navigation?.navigate?.('Chat', { initialMessage: 'Show me your pre-built training plans' })}
          secondaryActionLabel="Custom Plan with AI"
          secondaryOnAction={() => navigation?.navigate?.('Chat', { initialMessage: 'I want to create a new training plan' })}
        />
      </SafeAreaView>
    );
  }

  const totalWorkouts = plan.weeks.reduce((sum, w) => sum + w.workouts.length, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Overview */}
        <Card>
          <Text style={styles.planGoal}>{plan.goal_event}</Text>
          <View style={styles.planMeta}>
            <MetaStat label="Weeks" value={String(plan.weeks.length)} />
            <MetaStat label="Workouts" value={String(totalWorkouts)} />
            <MetaStat label="Total TSS" value={String(plan.total_tss)} />
          </View>
          <View style={styles.planDates}>
            <Text style={styles.planDateText}>
              {parseLocalDate(plan.start_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
            <Text style={styles.planDateSep}>→</Text>
            <Text style={styles.planDateText}>
              {parseLocalDate(plan.event_date).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>

          {/* Phase badges */}
          <View style={styles.phases}>
            {['base', 'build', 'peak', 'taper'].map(phase => {
              const count = plan.weeks.filter(w => w.phase === phase).length;
              if (!count) return null;
              const c = PHASE_COLORS[phase];
              return (
                <Badge key={phase} label={`${phase} (${count}w)`} color={c.bg} textColor={c.text} />
              );
            })}
          </View>
        </Card>

        {/* Week accordions */}
        {plan.weeks.map(week => (
          <WeekAccordion key={week.week_number} week={week} />
        ))}

        {/* Cancel button */}
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel Training Plan</Text>
        </TouchableOpacity>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaStat}>
      <Text style={styles.metaValue}>{value}</Text>
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16 },
  planGoal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 16,
  },
  planMeta: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  metaStat: { alignItems: 'center', gap: 4 },
  metaValue: { fontSize: 22, fontWeight: '700', color: '#f1f5f9' },
  metaLabel: { fontSize: 11, color: '#64748b' },
  planDates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  planDateText: { fontSize: 13, color: '#94a3b8' },
  planDateSep: { color: '#475569', fontSize: 14 },
  phases: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weekCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  weekHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weekHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekNum: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  weekTss: {
    fontSize: 13,
    color: '#94a3b8',
  },
  weekBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#0f172a',
  },
  weekNotes: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingTop: 8,
  },
  workoutRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    paddingTop: 8,
  },
  workoutDay: {
    width: 34,
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    paddingTop: 2,
  },
  workoutName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#f1f5f9',
  },
  workoutMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  cancelBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#450a0a',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 15,
  },
});
