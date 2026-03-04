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

export default function TodaySuggestionCard() {
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

  // Don't render anything while loading, on error, or if already ridden
  if (!loaded || !data || data.hasRiddenToday || !data.suggestion) return null;

  const { suggestion } = data;
  const statusInfo = STATUS_COLORS[suggestion.status] || STATUS_COLORS['well-recovered'];
  const actionInfo = ACTION_LABELS[suggestion.suggestedAction] || ACTION_LABELS['proceed-as-planned'];

  const handleChatPress = () => {
    const workout = suggestion.todaysWorkout || suggestion.suggestedWorkout;
    const msg = workout
      ? `I'd like to discuss today's plan: ${workout.name}. My TSB is ${suggestion.currentTSB.toFixed(1)} and I'm feeling ${suggestion.status.replace('-', ' ')}. What do you think?`
      : `I don't have a workout planned today. My TSB is ${suggestion.currentTSB.toFixed(1)} and I'm feeling ${suggestion.status.replace('-', ' ')}. What should I do?`;
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

      <Text style={styles.title}>Today's Suggestion</Text>
      <Text style={styles.summary}>{suggestion.summary}</Text>

      {suggestion.todaysWorkout && (
        <View style={styles.workoutBox}>
          <Text style={styles.workoutLabel}>Planned</Text>
          <Text style={styles.workoutName}>{suggestion.todaysWorkout.name}</Text>
          <Text style={styles.workoutMeta}>
            {suggestion.todaysWorkout.duration} min · {suggestion.todaysWorkout.type} · {suggestion.todaysWorkout.tss} TSS
          </Text>
        </View>
      )}

      {suggestion.suggestedWorkout && !suggestion.todaysWorkout && (
        <View style={[styles.workoutBox, styles.suggestedBox]}>
          <Text style={[styles.workoutLabel, styles.suggestedLabel]}>Suggested</Text>
          <Text style={styles.workoutName}>{suggestion.suggestedWorkout.name}</Text>
          <Text style={styles.workoutMeta}>
            {suggestion.suggestedWorkout.duration} min · {suggestion.suggestedWorkout.type}
          </Text>
          <Text style={styles.workoutDesc}>{suggestion.suggestedWorkout.description}</Text>
        </View>
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
  suggestedBox: {
    borderLeftColor: '#a78bfa',
  },
  workoutLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  suggestedLabel: {
    color: '#a78bfa',
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
