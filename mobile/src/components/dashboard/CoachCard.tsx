import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import Card from '../ui/Card';
import FreshnessGauge from './FreshnessGauge';
import { dailyAnalysisService } from '../../services/dailyAnalysisService';
import type { TodaySuggestion } from '../../services/dailyAnalysisService';
import { trainingService } from '../../services/trainingService';
import type { MainTabParamList } from '../../navigation/types';

interface TrainingStatus {
  ctl: number;
  atl: number;
  tsb: number;
  form_status: string;
}

export default function CoachCard() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [suggestion, setSuggestion] = useState<TodaySuggestion | null>(null);
  const [training, setTraining] = useState<TrainingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      dailyAnalysisService.getTodaySuggestion().catch(() => null),
      trainingService.getTrainingStatus().catch(() => null),
    ]).then(([s, t]) => {
      setSuggestion(s);
      setTraining(t ?? null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <Card>
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 24 }} />
      </Card>
    );
  }

  const tsb = training?.tsb ?? suggestion?.suggestion?.currentTSB ?? 0;
  const s = suggestion?.suggestion;
  const hasRidden = suggestion?.hasRiddenToday ?? false;

  const handleChatPress = () => {
    const workout = s?.todaysWorkout || s?.suggestedWorkout;
    const msg = workout
      ? `I'd like to discuss today's plan: ${workout.name}. My TSB is ${(s?.currentTSB ?? 0).toFixed(1)} and I'm feeling ${(s?.status ?? 'well-recovered').replace('-', ' ')}. What do you think?`
      : `I don't have a workout planned today. My TSB is ${(s?.currentTSB ?? 0).toFixed(1)} and I'm feeling ${(s?.status ?? 'well-recovered').replace('-', ' ')}. What should I do?`;
    navigation.navigate('Chat', { initialMessage: msg });
  };

  return (
    <Card>
      <Text style={styles.title}>Training Status</Text>

      {/* Freshness Gauge — compact, no CTL/ATL details */}
      <FreshnessGauge tsb={tsb} showDetails={false} />

      {/* Workout blocks + recommendation */}
      {s && (
        <View style={styles.aiSection}>
          {/* Today's completed rides (post-ride) */}
          {hasRidden && s.todaysRides.length > 0 && (
            <View style={[styles.workoutBox, styles.completedBox]}>
              <Text style={[styles.workoutLabel, styles.completedLabel]}>Completed Today</Text>
              {s.todaysRides.map((ride, i) => (
                <View key={i} style={styles.rideRow}>
                  <Text style={styles.rideName}>{ride.name}</Text>
                  <Text style={styles.rideMeta}>{ride.duration}min · Load {ride.tss}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Today's planned workout (pre-ride) */}
          {!hasRidden && s.todaysWorkout && (
            <View style={styles.workoutBox}>
              <Text style={styles.workoutLabel}>Planned</Text>
              <Text style={styles.workoutName}>{s.todaysWorkout.name}</Text>
              <Text style={styles.workoutMeta}>
                {s.todaysWorkout.duration}min · {s.todaysWorkout.type} · Load {s.todaysWorkout.tss}
              </Text>
            </View>
          )}

          {/* Suggested workout or rest day (pre-ride, no plan) */}
          {!hasRidden && s.suggestedWorkout && !s.todaysWorkout && (
            <View style={[styles.workoutBox, s.suggestedWorkout.type === 'rest' ? styles.restBox : styles.suggestedBox]}>
              <Text style={[styles.workoutLabel, s.suggestedWorkout.type === 'rest' ? styles.restLabel : styles.suggestedLabel]}>
                {s.suggestedWorkout.type === 'rest' ? 'Rest Day' : 'Suggested'}
              </Text>
              <Text style={styles.workoutName}>{s.suggestedWorkout.name}</Text>
              {s.suggestedWorkout.type !== 'rest' && (
                <Text style={styles.workoutMeta}>
                  {s.suggestedWorkout.duration}min · {s.suggestedWorkout.type}
                </Text>
              )}
            </View>
          )}

          {/* Tomorrow's scheduled workout (post-ride) */}
          {hasRidden && s.tomorrowsWorkout && (
            <View style={[styles.workoutBox, styles.tomorrowBox]}>
              <Text style={[styles.workoutLabel, styles.tomorrowLabel]}>Tomorrow</Text>
              <Text style={styles.workoutName}>{s.tomorrowsWorkout.name}</Text>
              <Text style={styles.workoutMeta}>
                {s.tomorrowsWorkout.duration}min · {s.tomorrowsWorkout.type} · Load {s.tomorrowsWorkout.tss}
              </Text>
            </View>
          )}

          {/* Suggested tomorrow workout or rest day (post-ride, no scheduled workout) */}
          {hasRidden && !s.tomorrowsWorkout && s.suggestedWorkout && (
            <View style={[styles.workoutBox, s.suggestedWorkout.type === 'rest' ? styles.restBox : styles.suggestedBox]}>
              <Text style={[styles.workoutLabel, s.suggestedWorkout.type === 'rest' ? styles.restLabel : styles.suggestedLabel]}>
                {s.suggestedWorkout.type === 'rest' ? 'Rest Day Tomorrow' : 'Suggested for Tomorrow'}
              </Text>
              <Text style={styles.workoutName}>{s.suggestedWorkout.name}</Text>
              {s.suggestedWorkout.type !== 'rest' && (
                <Text style={styles.workoutMeta}>
                  {s.suggestedWorkout.duration}min · {s.suggestedWorkout.type}
                </Text>
              )}
            </View>
          )}

          {/* Single recommendation line — the only AI text shown */}
          <Text style={styles.recommendation}>{s.recommendation}</Text>
        </View>
      )}

      {/* Expandable CTL/ATL details */}
      {training && (
        <View style={styles.detailsSection}>
          <TouchableOpacity
            onPress={() => setDetailsOpen(!detailsOpen)}
            style={styles.detailsToggle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={detailsOpen ? 'chevron-up' : 'chevron-down'}
              size={14}
              color="#64748b"
            />
            <Text style={styles.detailsToggleText}>Fitness & fatigue details</Text>
          </TouchableOpacity>
          {detailsOpen && (
            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Fitness</Text>
                <Text style={styles.detailValue}>{Math.round(training.ctl)}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Fatigue</Text>
                <Text style={styles.detailValue}>{Math.round(training.atl)}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Chat button */}
      <TouchableOpacity style={styles.chatButton} onPress={handleChatPress} activeOpacity={0.7}>
        <Ionicons name="chatbubbles-outline" size={18} color="#fff" />
        <Text style={styles.chatButtonText}>Chat with Coach</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  aiSection: {
    marginTop: 16,
    gap: 10,
  },
  workoutBox: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
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
  restBox: {
    borderLeftColor: '#22c55e',
    backgroundColor: '#052e16',
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
  restLabel: {
    color: '#22c55e',
  },
  rideRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  rideName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    flex: 1,
    marginRight: 8,
  },
  rideMeta: {
    fontSize: 13,
    color: '#94a3b8',
    flexShrink: 0,
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
  recommendation: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
  },
  detailsSection: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 10,
    marginTop: 12,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailsToggleText: {
    fontSize: 12,
    color: '#64748b',
  },
  detailsGrid: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 10,
  },
  detailItem: {
    flex: 1,
    borderLeftWidth: 2,
    borderLeftColor: '#334155',
    paddingLeft: 8,
  },
  detailLabel: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    marginTop: 2,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 12,
  },
  chatButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
