import React, { useState, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet, View, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { StravaActivity } from '../services/calendarService';

import CoachCard from '../components/dashboard/CoachCard';
import MetricsCard from '../components/dashboard/MetricsCard';
import WeeklyVolumeChart from '../components/dashboard/WeeklyVolumeChart';
import PowerCurveChart from '../components/dashboard/PowerCurveChart';
import FTPEstimateCard from '../components/dashboard/FTPEstimateCard';
import RecentActivities from '../components/dashboard/RecentActivities';
import ActivityDetailSheet from '../components/activity/ActivityDetailSheet';

const SNAP_POINTS = ['60%', '85%'];

const renderBackdrop = (props: any) => (
  <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
);

export default function DashboardScreen() {
  const [selectedActivity, setSelectedActivity] = useState<StravaActivity | null>(null);
  const activitySheetRef = useRef<BottomSheetModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <CoachCard key={`coach-${refreshKey}`} />
        <MetricsCard />
        <WeeklyVolumeChart />
        <PowerCurveChart />
        <FTPEstimateCard />
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
        <ActivityDetailSheet activity={selectedActivity} />
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
