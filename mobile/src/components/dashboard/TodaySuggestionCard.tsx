import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { dailyAnalysisService, TodaySuggestion } from '../../services/dailyAnalysisService';
import type { MainTabParamList } from '../../navigation/types';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  fresh: { bg: '#064e3b', text: '#34d399', label: 'Fresh' },
  'well-recovered': { bg: '#1e3a5f', text: '#60a5fa', label: 'Recovered' },
  'slightly-tired': { bg: '#713f12', text: '#fbbf24', label: 'Tired' },
  fatigued: { bg: '#7f1d1d', text: '#f87171', label: 'Fatigued' },
};

const ACTION_LABELS: Record<string, { icon: string; text: string; color: string }> = {
  'proceed-as-planned': { icon: 'checkmark-circle', text: 'Good to go as planned', color: '#34d399' },
  'make-easier': { icon: 'arrow-down-circle', text: 'Consider making it easier', color: '#fbbf24' },
  'add-rest': { icon: 'bed', text: 'Rest day recommended', color: '#f87171' },
  'can-do-more': { icon: 'arrow-up-circle', text: 'You can push harder today', color: '#60a5fa' },
  'suggested-workout': { icon: 'bulb', text: 'Suggested for today', color: '#a78bfa' },
};

interface TodaySuggestionCardProps {
  onWorkoutPress?: (workoutId: string) => void;
}

export default function TodaySuggestionCard({ onWorkoutPress }: TodaySuggestionCardProps = {}) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [data, setData] = useState<TodaySuggestion | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    dailyAnalysisService
      .getTodaySuggestion()
      .then((result) => {
        setData(result);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || !data?.suggestion) return null;

  const { suggestion, hasRiddenToday } = data;
  const statusInfo = STATUS_COLORS[suggestion.status] || STATUS_COLORS['well-recovered'];
  const actionInfo = ACTION_LABELS[suggestion.suggestedAction] || ACTION_LABELS['proceed-as-planned'];

  const handleChatPress = () => {
    let msg: string;
    if (hasRiddenToday) {
      // Post-ride: discuss today's ride and what's next
      const rideNames = suggestion.todaysRides.map(r => r.name).join(', ');
      const totalTSS = suggestion.todaysRides.reduce((sum, r) => sum + r.tss, 0);
      const tomorrowPart = suggestion.tomorrowsWorkout
        ? ` Tomorrow I have ${suggestion.tomorrowsWorkout.name} scheduled.`
        : '';
      msg = `I rode today: ${rideNames} (${totalTSS} TSS). My TSB is ${suggestion.currentTSB.toFixed(1)}.${tomorrowPart} How did my ride go and what should I focus on next?`;
    } else {
      // Pre-ride: discuss today's plan
      const workout = suggestion.todaysWorkout || suggestion.suggestedWorkout;
      msg = workout
        ? `I'd like to discuss today's plan: ${workout.name}. My TSB is ${suggestion.currentTSB.toFixed(1)} and I'm feeling ${suggestion.status.replace('-', ' ')}. What do you think?`
        : `I don't have a workout planned today. My TSB is ${suggestion.currentTSB.toFixed(1)} and I'm feeling ${suggestion.status.replace('-', ' ')}. What should I do?`;
    }
    navigation.navigate('Chat', { initialMessage: msg });
  };

  return (
    <Card>
      <View style={styles.header}>
        <Badge
          label={statusInfo.label}
          color={statusInfo.bg}
          textColor={statusInfo.text}
        />
        <Text style={styles.tsb}>TSB {suggestion.currentTSB.toFixed(0)}</Text>
      </View>

      <Text style={styles.title}>
        {hasRiddenToday ? "Today's Recap" : "Today's Plan"}
      </Text>
      <Text style={styles.summary}>{suggestion.summary}</Text>

      {/* Today's completed rides (post-ride) */}
      {hasRiddenToday && suggestion.todaysRides.length > 0 && (
        <View style={[styles.workoutBox, styles.completedBox]}>
          <Text style={[styles.workoutLabel, styles.completedLabel]}>Completed Today</Text>
          {suggestion.todaysRides.map((ride, i) => (
            <View key={i} style={styles.rideRow}>
              <Text style={styles.workoutName}>{ride.name}</Text>
              <Text style={styles.workoutMeta}>
                {ride.duration}min · {ride.tss} TSS
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Today's planned workout (pre-ride) */}
      {!hasRiddenToday && suggestion.todaysWorkout && (
        <TouchableOpacity
          activeOpacity={suggestion.todaysWorkout.workoutId ? 0.7 : 1}
          onPress={() => suggestion.todaysWorkout?.workoutId && onWorkoutPress?.(suggestion.todaysWorkout.workoutId)}
          disabled={!suggestion.todaysWorkout.workoutId}
        >
          <View style={styles.workoutBox}>
            <Text style={styles.workoutLabel}>Planned</Text>
            <Text style={styles.workoutName}>{suggestion.todaysWorkout.name}</Text>
            <Text style={styles.workoutMeta}>
              {suggestion.todaysWorkout.duration} min · {suggestion.todaysWorkout.type} · {suggestion.todaysWorkout.tss} TSS
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Suggested workout (pre-ride, no plan) */}
      {!hasRiddenToday && suggestion.suggestedWorkout && !suggestion.todaysWorkout && (
        <TouchableOpacity
          activeOpacity={suggestion.suggestedWorkout.workoutId ? 0.7 : 1}
          onPress={() => suggestion.suggestedWorkout?.workoutId && onWorkoutPress?.(suggestion.suggestedWorkout.workoutId)}
          disabled={!suggestion.suggestedWorkout.workoutId}
        >
          <View style={[styles.workoutBox, styles.suggestedBox]}>
            <Text style={[styles.workoutLabel, styles.suggestedLabel]}>Suggested</Text>
            <Text style={styles.workoutName}>{suggestion.suggestedWorkout.name}</Text>
            <Text style={styles.workoutMeta}>
              {suggestion.suggestedWorkout.duration} min · {suggestion.suggestedWorkout.type}
            </Text>
            <Text style={styles.workoutDesc}>{suggestion.suggestedWorkout.description}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Tomorrow's workout preview (post-ride) */}
      {hasRiddenToday && suggestion.tomorrowsWorkout && (
        <TouchableOpacity
          activeOpacity={suggestion.tomorrowsWorkout.workoutId ? 0.7 : 1}
          onPress={() => suggestion.tomorrowsWorkout?.workoutId && onWorkoutPress?.(suggestion.tomorrowsWorkout.workoutId)}
          disabled={!suggestion.tomorrowsWorkout.workoutId}
        >
          <View style={[styles.workoutBox, styles.tomorrowBox]}>
            <Text style={[styles.workoutLabel, styles.tomorrowLabel]}>Tomorrow</Text>
            <Text style={styles.workoutName}>{suggestion.tomorrowsWorkout.name}</Text>
            <Text style={styles.workoutMeta}>
              {suggestion.tomorrowsWorkout.duration} min · {suggestion.tomorrowsWorkout.type} · {suggestion.tomorrowsWorkout.tss} TSS
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.actionRow}>
        <Ionicons name={actionInfo.icon as any} size={16} color={actionInfo.color} />
        <Text style={[styles.actionText, { color: actionInfo.color }]}>{actionInfo.text}</Text>
      </View>

      <Text style={styles.recommendation}>{suggestion.recommendation}</Text>

      <TouchableOpacity style={styles.chatButton} onPress={handleChatPress} activeOpacity={0.7}>
        <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
        <Text style={styles.chatButtonText}>Chat with Coach</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tsb: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: '#cbd5e1',
    lineHeight: 20,
    marginBottom: 12,
  },
  workoutBox: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
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
  rideRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
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
  workoutDesc: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  recommendation: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 12,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
  },
  chatButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
