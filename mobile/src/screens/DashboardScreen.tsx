import React, { useState, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet, View, AppState, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { StravaActivity } from '../services/calendarService';
import { workoutService } from '../services/workoutService';
import type { Workout } from '../services/workoutService';

import CoachCard from '../components/dashboard/CoachCard';
import MetricsCard from '../components/dashboard/MetricsCard';
import WeeklyVolumeChart from '../components/dashboard/WeeklyVolumeChart';
import PowerCurveChart from '../components/dashboard/PowerCurveChart';
import FTPEstimateCard from '../components/dashboard/FTPEstimateCard';
import RecentActivities from '../components/dashboard/RecentActivities';
import ActivityDetailSheet from '../components/activity/ActivityDetailSheet';
import WorkoutDetailSheet from '../components/workout/WorkoutDetailSheet';

const SNAP_POINTS = ['60%', '85%'];

const renderBackdrop = (props: any) => (
  <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
);

export default function DashboardScreen() {
  const [selectedActivity, setSelectedActivity] = useState<StravaActivity | null>(null);
  const activitySheetRef = useRef<BottomSheetModal>(null);
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
    <SafeAreaView style={styles.safe} edges={['bottom']}>
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
        <CoachCard key={`coach-${refreshKey}`} onWorkoutPress={handleWorkoutPress} />
        <MetricsCard key={`metrics-${refreshKey}`} />
        <WeeklyVolumeChart key={`weekly-${refreshKey}`} />
        <PowerCurveChart key={`power-${refreshKey}`} />
        <FTPEstimateCard key={`ftp-${refreshKey}`} />
        <RecentActivities key={`activities-${refreshKey}`} onActivityPress={handleActivityPress} />
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
        <ActivityDetailSheet activity={selectedActivity} onFeedbackSaved={handleFeedbackSaved} />
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
  sheetBg: { backgroundColor: '#1e293b' },
  sheetHandle: { backgroundColor: '#475569' },
});
