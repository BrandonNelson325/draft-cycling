import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MetricsCard from '../components/dashboard/MetricsCard';
import TrainingStatusCard from '../components/dashboard/TrainingStatusCard';
import WeeklyVolumeChart from '../components/dashboard/WeeklyVolumeChart';
import PowerCurveChart from '../components/dashboard/PowerCurveChart';
import FTPEstimateCard from '../components/dashboard/FTPEstimateCard';
import RecentActivities from '../components/dashboard/RecentActivities';

export default function DashboardScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <MetricsCard />
        <TrainingStatusCard />
        <WeeklyVolumeChart />
        <PowerCurveChart />
        <FTPEstimateCard />
        <RecentActivities />
        <View style={styles.bottomPad} />
      </ScrollView>
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
});
