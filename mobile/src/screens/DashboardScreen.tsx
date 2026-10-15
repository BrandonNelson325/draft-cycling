import React, { useState, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet, View, Text, AppState, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../navigation/types';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { StravaActivity } from '../services/calendarService';
import { workoutService } from '../services/workoutService';
import type { Workout } from '../services/workoutService';

import CoachCard from '../components/dashboard/CoachCard';
import MetricsCard from '../components/dashboard/MetricsCard';
import WeeklyVolumeChart from '../components/dashboard/WeeklyVolumeChart';
import FitnessTrendChart from '../components/dashboard/FitnessTrendChart';
import PowerCurveChart from '../components/dashboard/PowerCurveChart';
import FTPEstimateCard from '../components/dashboard/FTPEstimateCard';
import OtherTrainingCard from '../components/dashboard/OtherTrainingCard';
import RecentActivities from '../components/dashboard/RecentActivities';
import { useAuthStore } from '../stores/useAuthStore';
import ActivityDetailSheet from '../components/activity/ActivityDetailSheet';
import WorkoutDetailSheet from '../components/workout/WorkoutDetailSheet';

const SNAP_POINTS = ['60%', '85%'];

const renderBackdrop = (props: any) => (
  <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
);

// Screen anchor: a time-of-day greeting + today's date (also anchors the card's Today/Tomorrow rows).
function DashboardGreeting() {
  const user = useAuthStore((st) => st.user);
  const now = new Date();
  const h = now.getHours();
  const part = h < 5 ? 'evening' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const first = user?.full_name?.trim().split(/\s+/)[0];
  return (
    <View style={styles.greeting}>
      <Text style={styles.greetingTitle}>Good {part}{first ? `, ${first}` : ''}</Text>
      <Text style={styles.greetingDate}>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [selectedActivity, setSelectedActivity] = useState<StravaActivity | null>(null);
  const activitySheetRef = useRef<BottomSheetModal>(null);
  const openDebrief = useCallback((message: string) => {
    activitySheetRef.current?.dismiss();
    navigation.navigate('Chat', { initialMessage: message });
  }, [navigation]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const workoutSheetRef = useRef<BottomSheetModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    // Components will remount and refetch. Use a short delay to dismiss the spinner.
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  // Refresh when screen comes into focus (tab switch or app foreground)
  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          setRefreshKey((k) => k + 1);
        }
      });
      // Also refresh on tab focus
      setRefreshKey((k) => k + 1);
      return () => sub.remove();
    }, [])
  );

  const handleActivityPress = useCallback((activity: StravaActivity) => {
    setSelectedActivity(activity);
    activitySheetRef.current?.present();
  }, []);

  const handleWorkoutPress = useCallback(async (workoutId: string) => {
    try {
      const workout = await workoutService.getWorkout(workoutId);
      setSelectedWorkout(workout);
      workoutSheetRef.current?.present();
    } catch (err) {
      console.error('Failed to load workout:', err);
    }
  }, []);

  const handleFeedbackSaved = useCallback((activityId: string, effort: number) => {
    setSelectedActivity((prev) =>
      prev && prev.id === activityId ? { ...prev, perceived_effort: effort } : prev
    );
    // Refresh activity list so re-opening shows saved RPE
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={['#3b82f6']}
          />
        }
      >
        <DashboardGreeting />
        <CoachCard key={`coach-${refreshKey}`} onWorkoutPress={handleWorkoutPress} />
        <FitnessTrendChart key={`fitness-${refreshKey}`} />
        <MetricsCard key={`metrics-${refreshKey}`} />
        <WeeklyVolumeChart key={`weekly-${refreshKey}`} />
        <PowerCurveChart key={`power-${refreshKey}`} />
        <FTPEstimateCard key={`ftp-${refreshKey}`} />
        <RecentActivities key={`activities-${refreshKey}`} onActivityPress={handleActivityPress} />
        <OtherTrainingCard key={`other-${refreshKey}`} />
        <View style={styles.bottomPad} />
      </ScrollView>

      <BottomSheetModal
        ref={activitySheetRef}
        snapPoints={SNAP_POINTS}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <ActivityDetailSheet activity={selectedActivity} onFeedbackSaved={handleFeedbackSaved} onDebrief={openDebrief} />
      </BottomSheetModal>

      <BottomSheetModal
        ref={workoutSheetRef}
        snapPoints={['85%']}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <WorkoutDetailSheet
          workout={selectedWorkout}
          onClose={() => workoutSheetRef.current?.dismiss()}
          onScheduled={() => {
            workoutSheetRef.current?.dismiss();
            setRefreshKey(k => k + 1);
          }}
          showSchedule={true}
        />
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  bottomPad: {
    height: 16,
  },
  greeting: {
    paddingHorizontal: 4,
    paddingTop: 4,
    marginBottom: 14,
  },
  greetingTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#f1f5f9',
    letterSpacing: -0.3,
  },
  greetingDate: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 2,
  },
  sheetBg: { backgroundColor: '#1e293b' },
  sheetHandle: { backgroundColor: '#475569' },
});
